"""Integrated Gradients visualization for CheXpert models.

Computes pixel-level attribution using Integrated Gradients method (Sundararajan et al. 2017).
Shows which pixels contribute most to each pathology prediction.

Usage (from project root):
  uv run python -m scripts.integrated_gradients \
    --config CONFIG --checkpoint CHECKPOINT \
    --image PATH_TO_IMAGE \
    --output outputs/integrated_gradients/

  # Or use --index N to pick the Nth image from the test set:
  uv run python -m scripts.integrated_gradients \
    --config CONFIG --checkpoint CHECKPOINT \
    --index 42 --output outputs/integrated_gradients/
    
  # Adjust number of steps for Riemann approximation (default=50):
  uv run python -m scripts.integrated_gradients \
    --config CONFIG --checkpoint CHECKPOINT \
    --image PATH --n-steps 100
"""

import argparse
import os

import matplotlib.cm as cm
import matplotlib.pyplot as plt
import numpy as np
import torch
from captum.attr import IntegratedGradients
from PIL import Image

from src.dataset import get_cxr_valid_transforms, get_valid_transforms
from src.model import build_model
from src.utils import get_device, load_config


def _label_to_slug(label: str) -> str:
    """Convert model label name to frontend finding ID (e.g. 'Pleural Effusion' → 'pleural_effusion')."""
    return label.lower().replace(" ", "_")


def _save_overlay_png(heatmap: np.ndarray, output_path: str, colormap: str = "hot") -> None:
    """Save a per-finding attribution map as a transparent RGBA PNG overlay.

    The alpha channel is set proportional to attribution intensity so that
    zero-attribution regions are fully transparent and can be composited
    over the original X-ray in the frontend using mix-blend-mode: screen.
    """
    cmap = cm.get_cmap(colormap)
    rgba = cmap(heatmap).astype(np.float64)           # (H, W, 4) in [0, 1]
    rgba[:, :, 3] = np.clip(heatmap * 1.5, 0.0, 1.0)  # boost alpha for visibility
    rgba_uint8 = (rgba * 255).astype(np.uint8)
    Image.fromarray(rgba_uint8, mode="RGBA").save(output_path)


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


def _load_image_rgb(path: str, image_size: int) -> np.ndarray:
    """Load an image and return it as a float32 RGB array in [0, 1]."""
    img = Image.open(path).convert("RGB")
    img = img.resize((image_size, image_size), Image.BILINEAR)
    return np.array(img).astype(np.float32) / 255.0


class SingleOutputWrapper(torch.nn.Module):
    """Wrapper to extract a single output from multi-label model."""
    
    def __init__(self, model, target_idx: int):
        super().__init__()
        self.model = model
        self.target_idx = target_idx
    
    def forward(self, x):
        logits = self.model(x)
        return logits[:, self.target_idx:self.target_idx + 1]


def run_integrated_gradients(
    config_path: str,
    checkpoint_path: str,
    image_path: str,
    output_dir: str,
    n_steps: int = 50,
    true_labels: list[float] | None = None,
    study_overlays: bool = False,
) -> None:
    """Generate Integrated Gradients visualizations.

    When study_overlays=True, saves individual transparent RGBA PNG overlays
    per finding (no composite figure) suitable for frontend display.
    When False (default), saves the original composite matplotlib figure.
    """
    cfg = load_config(config_path)
    device = get_device(cfg)
    
    # Captum has issues with MPS on Apple Silicon - use CPU instead
    if device.type == "mps":
        print("Note: Using CPU instead of MPS for Captum compatibility", flush=True)
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
    input_tensor.requires_grad = True
    
    # Get predictions
    with torch.no_grad():
        logits = model(input_tensor)
        probs = torch.sigmoid(logits).cpu().numpy()[0]
    
    # Load RGB image for visualization
    rgb_img = _load_image_rgb(image_path, image_size)
    
    # Create baseline (black image)
    baseline = torch.zeros_like(input_tensor).to(device)
    
    # Compute Integrated Gradients for each label
    n_labels = len(target_labels)
    attributions = []
    
    print(f"Computing Integrated Gradients with {n_steps} steps...", flush=True)
    
    for i in range(n_labels):
        # Wrap model to output single label
        wrapped_model = SingleOutputWrapper(model, i)
        
        # Compute IG
        ig = IntegratedGradients(wrapped_model)
        attr = ig.attribute(
            input_tensor,
            baselines=baseline,
            n_steps=n_steps,
            internal_batch_size=1,
        )
        
        # Aggregate over channels (take absolute value and sum)
        attr_agg = attr.abs().sum(dim=1).squeeze(0).detach().cpu().numpy()
        
        # Normalize to [0, 1]
        attr_min, attr_max = attr_agg.min(), attr_agg.max()
        if attr_max > attr_min:
            attr_norm = (attr_agg - attr_min) / (attr_max - attr_min)
        else:
            attr_norm = np.zeros_like(attr_agg)
        
        attributions.append(attr_norm)
        print(f"  [{i+1}/{n_labels}] {target_labels[i]}: done", flush=True)
    
    # Build descriptive basename from patient path
    os.makedirs(output_dir, exist_ok=True)
    parts = image_path.replace("\\", "/").split("/")
    patient_parts = [p for p in parts if p.startswith("patient") or p.startswith("study") or p.startswith("view")]
    basename = "_".join(patient_parts) if patient_parts else os.path.splitext(os.path.basename(image_path))[0]
    basename = basename.replace(".jpg", "").replace(".png", "")

    if study_overlays:
        # --- Per-finding transparent RGBA PNGs for frontend overlay ---
        # Resize attribution to original image dimensions so it aligns correctly
        # when both X-ray and overlay are shown with CSS object-contain.
        orig_img_pil = Image.open(image_path)
        orig_w, orig_h = orig_img_pil.size
        for i, label in enumerate(target_labels):
            attr_uint8 = (attributions[i] * 255).astype(np.uint8)
            attr_resized = np.array(
                Image.fromarray(attr_uint8).resize((orig_w, orig_h), Image.BILINEAR)
            ).astype(np.float32) / 255.0
            slug = _label_to_slug(label)
            out_path = os.path.join(output_dir, f"{basename}_intgrad_{slug}.png")
            _save_overlay_png(attr_resized, out_path, colormap="hot")
            print(f"Saved: {out_path}")
    else:
        # --- Original composite matplotlib figure (research use) ---
        fig, axes = plt.subplots(1, n_labels + 1, figsize=(4 * (n_labels + 1), 4))

        axes[0].imshow(rgb_img, cmap="gray")
        axes[0].set_title("Original", fontsize=11)
        axes[0].axis("off")

        for i, label in enumerate(target_labels):
            axes[i + 1].imshow(rgb_img, cmap="gray")
            axes[i + 1].imshow(attributions[i], cmap="hot", alpha=0.6)
            gt_str = _format_gt_value(true_labels[i]) if true_labels is not None and i < len(true_labels) else "N/A"
            axes[i + 1].set_title(f"{label}\nGT={gt_str} | p={probs[i]:.3f}", fontsize=10)
            axes[i + 1].axis("off")

        fig.suptitle(f"Integrated Gradients — {arch}", fontsize=13, y=1.02)
        fig.tight_layout()
        out_path = os.path.join(output_dir, f"{basename}_{arch}_ig.png")
        fig.savefig(out_path, dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"Saved: {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Integrated Gradients for CheXpert models.")
    parser.add_argument("--config", required=True, help="Path to YAML config.")
    parser.add_argument("--checkpoint", required=True, help="Path to .pt checkpoint.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--image", help="Path to a single X-ray image.")
    group.add_argument("--index", type=int, help="Pick the Nth image from the test set.")
    parser.add_argument("--output", default="outputs/integrated_gradients/", help="Output directory.")
    parser.add_argument("--n-steps", type=int, default=50, help="Number of steps for IG approximation.")
    parser.add_argument("--study-overlays", action="store_true",
                        help="Save individual transparent RGBA PNGs per finding instead of composite figure.")
    args = parser.parse_args()
    
    true_labels = None

    if args.image:
        image_path = args.image
    else:
        # Load test set and pick image by index
        import pandas as pd
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
    
    run_integrated_gradients(
        args.config,
        args.checkpoint,
        image_path,
        args.output,
        args.n_steps,
        true_labels=true_labels,
        study_overlays=args.study_overlays,
    )
