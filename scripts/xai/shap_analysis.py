"""SHAP (SHapley Additive exPlanations) visualization for CheXpert models.

Computes Shapley value-based attributions showing pixel-level contributions.
Includes Model Randomization Test (Adebayo et al. 2018) as sanity check.

Usage (from project root):
  uv run python -m scripts.shap_analysis \
    --config CONFIG --checkpoint CHECKPOINT \
    --image PATH_TO_IMAGE \
    --output outputs/shap/

  # With sanity check (tests if SHAP depends on model weights):
  uv run python -m scripts.shap_analysis \
    --config CONFIG --checkpoint CHECKPOINT \
    --image PATH --run-sanity-check
    
  # Adjust number of background samples (default=100):
  uv run python -m scripts.shap_analysis \
    --config CONFIG --checkpoint CHECKPOINT \
    --image PATH --n-background 50
"""

import argparse
import copy
import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from scipy.stats import pearsonr

import shap

from src.dataset import CheXpertDataset, get_cxr_valid_transforms, get_valid_transforms
from src.model import build_model
from src.utils import get_device, load_config


def _format_gt_value(v) -> str:
    """Format GT value as 0/1/U (uncertain)."""
    if v is None:
        return "N/A"
    if isinstance(v, float) and np.isnan(v):
        return "U"
    try:
        fv = float(v)
    except Exception:
        return "N/A"
    if fv < 0:
        return "U"
    return "1" if fv >= 0.5 else "0"


def _disable_inplace_ops(module: nn.Module) -> None:
    """Disable in-place ops (e.g., ReLU(inplace=True)) to avoid SHAP backward-hook view errors."""
    for submodule in module.modules():
        if hasattr(submodule, "inplace"):
            try:
                submodule.inplace = False
            except Exception:
                pass


class DenseNetNoInplaceWrapper(nn.Module):
    """Wrap DenseNet-like models with a non-inplace forward for SHAP compatibility."""

    def __init__(self, base_model: nn.Module):
        super().__init__()
        self.base = base_model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.base.features(x)
        out = F.relu(features, inplace=False)
        out = F.adaptive_avg_pool2d(out, (1, 1))
        out = torch.flatten(out, 1)
        out = self.base.classifier(out)
        return out


def _load_image_rgb(path: str, image_size: int) -> np.ndarray:
    """Load an image and return it as a float32 RGB array in [0, 1]."""
    img = Image.open(path).convert("RGB")
    img = img.resize((image_size, image_size), Image.BILINEAR)
    return np.array(img).astype(np.float32) / 255.0


class SingleOutputWrapper(nn.Module):
    """Wrapper to extract a single output from multi-label model."""
    
    def __init__(self, model, target_idx: int):
        super().__init__()
        self.model = model
        self.target_idx = target_idx
    
    def forward(self, x):
        logits = self.model(x)
        # Return only the target output (keep batch dimension)
        return logits[:, self.target_idx:self.target_idx + 1]


def get_background_samples(cfg: dict, n_samples: int = 100) -> torch.Tensor:
    """Load random samples from training set as SHAP background."""
    data_cfg = cfg["data"]
    image_size = data_cfg["image_size"]
    use_cxr = data_cfg.get("cxr_pretrained", False)
    
    # Load training data
    df = pd.read_csv(data_cfg["train_csv"])
    if data_cfg.get("frontal_only", False):
        df = df[df["Frontal/Lateral"] == "Frontal"]
    
    # Sample random indices
    n_samples = min(n_samples, len(df))
    indices = np.random.choice(len(df), size=n_samples, replace=False)
    
    # Get transforms
    if use_cxr:
        tfm = get_cxr_valid_transforms(image_size)
    else:
        tfm = get_valid_transforms(image_size)
    
    # Load images
    samples = []
    failed_count = 0
    for idx in indices:
        raw_path = df.iloc[idx]["Path"]
        data_dir = data_cfg["data_dir"]
        
        # Resolve path
        if os.path.isabs(data_dir):
            rel = raw_path.split("/", 1)[1] if "/" in raw_path else raw_path
            img_path = os.path.join(data_dir, rel)
        else:
            img_path = os.path.join(os.path.dirname(data_dir), raw_path)
        
        try:
            if use_cxr:
                img = Image.open(img_path).convert("L")
            else:
                img = Image.open(img_path).convert("RGB")
            tensor = tfm(img)
            samples.append(tensor)
        except Exception as e:
            print(f"[WARNING]️ Background sample failed [{idx}]: {e}", flush=True)
            failed_count += 1
            continue
    
    if not samples:
        raise RuntimeError(f"Failed to load any background samples (tried {n_samples}, failed {failed_count})")
    
    if failed_count > 0:
        print(f"[WARNING]️ Loaded {len(samples)}/{n_samples} background samples ({failed_count} failed)", flush=True)
    
    return torch.stack(samples)


def randomize_model_cascade(model: nn.Module, arch: str, level: float):
    """Randomize a fraction of model weights from top (classifier) to bottom.
    
    Args:
        model: The model to randomize (modified in-place)
        arch: Architecture name
        level: Fraction of layers to randomize (0.0 = none, 1.0 = all)
    """
    # Get all named parameters
    params = list(model.named_parameters())
    
    # Determine how many layers to randomize (from end)
    n_to_randomize = int(len(params) * level)
    
    # Randomize from the end (classifier first, then backwards)
    for i in range(len(params) - n_to_randomize, len(params)):
        name, param = params[i]
        with torch.no_grad():
            if "weight" in name:
                if param.ndim >= 2:
                    nn.init.xavier_uniform_(param)
                else:
                    nn.init.normal_(param, mean=0.0, std=0.02)
            elif "bias" in name:
                nn.init.zeros_(param)


def compute_shap_for_label(
    model: nn.Module,
    input_tensor: torch.Tensor,
    background: torch.Tensor,
    target_idx: int,
    device: torch.device,
    arch: str,
) -> np.ndarray:
    """Compute SHAP values for a single output label."""
    # Wrap model to output single class
    wrapped_model = SingleOutputWrapper(model, target_idx)

    # Explainer strategy:
    # - Transformers: GradientExplainer is more stable with timm modules.
    # - CNNs: try DeepExplainer first, fallback to GradientExplainer on failure.
    if arch in ("swin_tiny", "vit_base"):
        explainer = shap.GradientExplainer(wrapped_model, background)
        shap_values = explainer.shap_values(input_tensor)
    else:
        try:
            explainer = shap.DeepExplainer(wrapped_model, background)
            shap_values = explainer.shap_values(input_tensor, check_additivity=False)
        except Exception as e:
            print(f"[WARNING]️ DeepExplainer failed for label {target_idx} ({arch}): {e}", flush=True)
            print(" Falling back to GradientExplainer.", flush=True)
            explainer = shap.GradientExplainer(wrapped_model, background)
            shap_values = explainer.shap_values(input_tensor)
    
    # shap_values shape can vary by explainer/model; normalize robustly.
    if isinstance(shap_values, list):
        shap_values = shap_values[0]

    sv = np.array(shap_values)
    sv = np.squeeze(sv)

    if sv.ndim == 4:
        # Possible layouts: (B,C,H,W) or (B,H,W,C)
        if sv.shape[0] == input_tensor.shape[0] and sv.shape[1] in (1, 3):
            sv = sv[0] # -> (C,H,W)
        elif sv.shape[0] == input_tensor.shape[0] and sv.shape[-1] in (1, 3):
            sv = np.transpose(sv[0], (2, 0, 1)) # -> (C,H,W)
        else:
            sv = sv[0]

    if sv.ndim == 3:
        # Channel-first (C,H,W) or channel-last (H,W,C)
        if sv.shape[0] in (1, 3):
            shap_agg = np.abs(sv).sum(axis=0)
        elif sv.shape[-1] in (1, 3):
            shap_agg = np.abs(sv).sum(axis=-1)
        else:
            shap_agg = np.abs(sv).mean(axis=0)
    elif sv.ndim == 2:
        shap_agg = np.abs(sv)
    else:
        raise RuntimeError(f"Unexpected SHAP output shape for label {target_idx}: {sv.shape}")
    
    # Normalize to [0, 1]
    shap_min, shap_max = shap_agg.min(), shap_agg.max()
    if shap_max > shap_min:
        shap_norm = (shap_agg - shap_min) / (shap_max - shap_min)
    else:
        shap_norm = np.zeros_like(shap_agg)
    
    return shap_norm


def run_shap_analysis(
    config_path: str,
    checkpoint_path: str,
    image_path: str,
    output_dir: str,
    n_background: int = 100,
    run_sanity_check: bool = False,
    true_labels: list[float] | None = None,
) -> None:
    cfg = load_config(config_path)
    device = get_device(cfg)
    
    # SHAP has issues with MPS on Apple Silicon - use CPU instead
    if device.type == "mps":
        print("\n[WARNING]️ SHAP is incompatible with MPS (Apple Silicon). Falling back to CPU.", flush=True)
        print(" This will be slower (10-30 min per image), but necessary for stability.", flush=True)
        device = torch.device("cpu")
    
    data_cfg = cfg["data"]
    target_labels = cfg["labels"]["target_labels"]
    image_size = data_cfg["image_size"]
    arch = cfg["model"]["architecture"]
    use_cxr = data_cfg.get("cxr_pretrained", False)
    
    # Build model and load checkpoint
    cfg["model"]["pretrained"] = False
    model = build_model(cfg).to(device)
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    _disable_inplace_ops(model)
    if arch.startswith("densenet"):
        model = DenseNetNoInplaceWrapper(model).to(device)
    model.eval()
    print(f"Loaded {arch} from epoch {ckpt['epoch']}", flush=True)
    
    # Prepare input
    if use_cxr:
        tfm = get_cxr_valid_transforms(image_size)
        pil_img = Image.open(image_path).convert("L")
    else:
        tfm = get_valid_transforms(image_size)
        pil_img = Image.open(image_path).convert("RGB")
    
    input_tensor = tfm(pil_img).unsqueeze(0).to(device)
    
    # Get predictions
    with torch.no_grad():
        logits = model(input_tensor)
        probs = torch.sigmoid(logits).cpu().numpy()[0]
    
    # Load RGB image for visualization
    rgb_img = _load_image_rgb(image_path, image_size)
    
    # Load background samples
    print(f"Loading {n_background} background samples from training set...", flush=True)
    background = get_background_samples(cfg, n_background).to(device)
    print(f"Background shape: {background.shape}", flush=True)
    
    # Compute SHAP values for each label
    n_labels = len(target_labels)
    shap_maps = []
    
    print(f"Computing SHAP values for {n_labels} labels...", flush=True)
    
    for i in range(n_labels):
        shap_map = compute_shap_for_label(model, input_tensor, background, i, device, arch)
        shap_maps.append(shap_map)
        print(f" [{i+1}/{n_labels}] {target_labels[i]}: done", flush=True)
    
    # Create visualization
    fig, axes = plt.subplots(1, n_labels + 1, figsize=(4 * (n_labels + 1), 4))
    
    # Panel 0: original
    axes[0].imshow(rgb_img, cmap="gray")
    axes[0].set_title("Original", fontsize=11)
    axes[0].axis("off")
    
    # Panels 1-n: SHAP heatmaps
    for i, label in enumerate(target_labels):
        axes[i + 1].imshow(rgb_img, cmap="gray")
        axes[i + 1].imshow(shap_maps[i], cmap="hot", alpha=0.6)
        gt_str = _format_gt_value(true_labels[i]) if true_labels is not None and i < len(true_labels) else "N/A"
        axes[i + 1].set_title(f"{label}\nGT={gt_str} | p={probs[i]:.3f}", fontsize=10)
        axes[i + 1].axis("off")
    
    fig.suptitle(f"SHAP Analysis — {arch}", fontsize=13, y=1.02)
    fig.tight_layout()
    
    # Save main figure
    os.makedirs(output_dir, exist_ok=True)
    parts = image_path.replace("\\", "/").split("/")
    patient_parts = [p for p in parts if p.startswith("patient") or p.startswith("study") or p.startswith("view")]
    basename = "_".join(patient_parts) if patient_parts else os.path.splitext(os.path.basename(image_path))[0]
    basename = basename.replace(".jpg", "").replace(".png", "")
    out_path = os.path.join(output_dir, f"{basename}_{arch}_shap.png")
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved: {out_path}")
    
    # Run Sanity Check if requested
    if run_sanity_check:
        print("\n" + "="*60)
        print("Running Model Randomization Test (Sanity Check)")
        print("="*60)
        
        # Test at multiple randomization levels
        randomization_levels = [0.0, 0.25, 0.5, 0.75, 1.0]
        correlations = {label: [] for label in target_labels}
        
        for level in randomization_levels:
            print(f"\nRandomization level: {level*100:.0f}%")
            
            # Create a copy of the model and randomize it
            model_random = copy.deepcopy(model)
            if level > 0:
                randomize_model_cascade(model_random, arch, level)
            model_random.eval()
            
            # Compute SHAP values with randomized model
            for i, label in enumerate(target_labels):
                shap_random = compute_shap_for_label(model_random, input_tensor, background, i, device, arch)
                
                # Compute correlation with original SHAP values
                # Flatten both arrays
                original_flat = shap_maps[i].flatten()
                random_flat = shap_random.flatten()
                
                # Pearson correlation
                corr, _ = pearsonr(original_flat, random_flat)
                correlations[label].append(corr)
                print(f" {label}: correlation = {corr:.3f}")
            
            del model_random
            torch.cuda.empty_cache() if torch.cuda.is_available() else None
        
        # Plot sanity check results
        fig_sanity, ax = plt.subplots(figsize=(10, 6))
        
        for label in target_labels:
            ax.plot(randomization_levels, correlations[label], marker='o', label=label, linewidth=2)
        
        ax.set_xlabel("Fraction of Weights Randomized", fontsize=12)
        ax.set_ylabel("Pearson Correlation with Original SHAP", fontsize=12)
        ax.set_title(f"Model Randomization Test (Sanity Check) — {arch}", fontsize=14)
        ax.legend(loc="best", fontsize=10)
        ax.grid(True, alpha=0.3)
        ax.set_xlim(-0.05, 1.05)
        ax.set_ylim(-0.1, 1.1)
        
        # Add expected behavior annotation
        ax.text(0.5, 0.95, "Expected: Correlation should decrease with more randomization",
                transform=ax.transAxes, ha="center", va="top", fontsize=10,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="yellow", alpha=0.3))
        
        fig_sanity.tight_layout()
        
        # Save sanity check figure
        sanity_path = os.path.join(output_dir, f"{basename}_{arch}_shap_sanitycheck.png")
        fig_sanity.savefig(sanity_path, dpi=150, bbox_inches="tight")
        plt.close(fig_sanity)
        print(f"\nSanity check plot saved: {sanity_path}")
        
        # Print summary
        print("\n" + "="*60)
        print("Sanity Check Summary:")
        print("="*60)
        for label in target_labels:
            corr_drop = correlations[label][0] - correlations[label][-1]
            print(f"{label:20s}: {correlations[label][0]:.3f} → {correlations[label][-1]:.3f} (drop: {corr_drop:.3f})")
        print("\nInterpretation: Large correlation drop (>0.5) indicates SHAP")
        print("values are model-dependent (good). Small drop suggests the")
        print("explanations may not reflect actual model behavior.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SHAP analysis with sanity checks for CheXpert models.")
    parser.add_argument("--config", required=True, help="Path to YAML config.")
    parser.add_argument("--checkpoint", required=True, help="Path to .pt checkpoint.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--image", help="Path to a single X-ray image.")
    group.add_argument("--index", type=int, help="Pick the Nth image from the test set.")
    parser.add_argument("--output", default="outputs/shap/", help="Output directory.")
    parser.add_argument("--n-background", type=int, default=100, help="Number of background samples for SHAP.")
    parser.add_argument("--run-sanity-check", action="store_true", help="Run model randomization sanity check.")
    args = parser.parse_args()
    
    true_labels = None

    if args.image:
        image_path = args.image
    else:
        # Load test set and pick image by index
        cfg = load_config(args.config)
        data_cfg = cfg["data"]
        df = pd.read_csv(data_cfg["test_csv"])
        if data_cfg.get("frontal_only", False):
            df = df[df["Frontal/Lateral"] == "Frontal"].reset_index(drop=True)
        raw_path = df.iloc[args.index]["Path"]
        target_labels = cfg["labels"]["target_labels"]
        true_labels = [df.iloc[args.index].get(lbl, np.nan) for lbl in target_labels]
        data_dir = data_cfg["data_dir"]
        if os.path.isabs(data_dir):
            rel = raw_path.split("/", 1)[1] if "/" in raw_path else raw_path
            image_path = os.path.join(data_dir, rel)
        else:
            image_path = os.path.join(os.path.dirname(data_dir), raw_path)
        print(f"Test image [{args.index}]: {image_path}")
    
    run_shap_analysis(
        args.config,
        args.checkpoint,
        image_path,
        args.output,
        args.n_background,
        args.run_sanity_check,
        true_labels=true_labels,
    )
