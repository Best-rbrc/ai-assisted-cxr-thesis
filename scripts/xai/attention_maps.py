"""Attention/Saliency Map visualization for Transformer-based CheXpert models.

For ViT: Extracts CLS token attention weights (what the classifier looks at).
For Swin: Uses gradient-based saliency (which patches affect prediction most).

Usage (from project root):
  uv run python -m scripts.attention_maps \
    --config CONFIG --checkpoint CHECKPOINT \
    --image PATH_TO_IMAGE \
    --output outputs/attention_maps/

  # Or use --index N to pick the Nth image from the test set:
  uv run python -m scripts.attention_maps \
    --config CONFIG --checkpoint CHECKPOINT \
    --index 42 --output outputs/attention_maps/
"""

import argparse
import os

import cv2
import matplotlib.pyplot as plt
import numpy as np
import torch
from PIL import Image

from src.dataset import get_valid_transforms
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


def get_vit_attention_map(model, input_tensor, img_size=224):
    """Extract attention map from ViT CLS token."""
    attention_weights = []
    
    def hook_fn(module, input, output):
        # For timm ViT, attention module computes QKV internally
        # We need to replicate to get attention weights
        B, N, C = input[0].shape
        qkv = module.qkv(input[0]).reshape(B, N, 3, module.num_heads, C // module.num_heads).permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2] # (B, num_heads, N, head_dim)
        
        # Compute attention scores
        attn = (q @ k.transpose(-2, -1)) * module.scale # (B, num_heads, N, N)
        attn = attn.softmax(dim=-1)
        attention_weights.append(attn.detach().cpu())
    
    # Register hook on last attention block
    handle = model.blocks[-1].attn.register_forward_hook(hook_fn)
    
    # Forward pass
    with torch.no_grad():
        _ = model(input_tensor)
    
    handle.remove()
    
    if not attention_weights:
        raise RuntimeError("Failed to capture attention weights from ViT. Hook may not have been triggered.")
    
    # Get attention from CLS token (position 0) to all patches
    attn = attention_weights[0] # (B, num_heads, N, N)
    # Average over heads, take CLS token row (index 0)
    cls_attn = attn[0].mean(0)[0, 1:] # (num_patches,) - exclude CLS->CLS
    
    # Reshape to spatial grid
    num_patches = len(cls_attn)
    grid_size = int(np.sqrt(num_patches))
    
    attn_map = cls_attn.numpy().reshape(grid_size, grid_size)
    
    # Normalize
    attn_map = (attn_map - attn_map.min()) / (attn_map.max() - attn_map.min() + 1e-8)
    
    return attn_map


def get_swin_gradient_map(model, input_tensor, target_idx: int, smooth_samples: int = 12):
    """Get SmoothGrad saliency map for Swin (less speckle than raw input gradients)."""
    base = input_tensor.detach()
    grad_accum = torch.zeros_like(base)

    noise_std = max(float(base.std().item()) * 0.10, 1e-6)

    for _ in range(smooth_samples):
        noisy = (base + torch.randn_like(base) * noise_std).requires_grad_(True)
        output = model(noisy)
        target_score = output[:, target_idx].sum()

        model.zero_grad(set_to_none=True)
        target_score.backward()
        grad_accum += noisy.grad.detach()

    gradients = (grad_accum / smooth_samples).detach().cpu()[0] # (C, H, W)
    saliency = gradients.abs().sum(dim=0).numpy() # (H, W)

    # Robust normalization (ignore extreme outliers)
    p_low, p_high = np.percentile(saliency, [5, 99])
    saliency = np.clip(saliency, p_low, p_high)
    saliency = (saliency - saliency.min()) / (saliency.max() - saliency.min() + 1e-8)

    # Light spatial smoothing for cleaner visualization
    saliency = cv2.GaussianBlur(saliency, (0, 0), sigmaX=2.0, sigmaY=2.0)
    saliency = (saliency - saliency.min()) / (saliency.max() - saliency.min() + 1e-8)

    return saliency


def _load_image_rgb(path: str, image_size: int) -> np.ndarray:
    """Load an image and return it as a float32 RGB array in [0, 1]."""
    img = Image.open(path).convert("RGB")
    img = img.resize((image_size, image_size), Image.BILINEAR)
    return np.array(img).astype(np.float32) / 255.0


def run_attention_maps(
    config_path: str,
    checkpoint_path: str,
    image_path: str,
    output_dir: str,
    true_labels: list[float] | None = None,
) -> None:
    cfg = load_config(config_path)
    device = get_device(cfg)
    data_cfg = cfg["data"]
    target_labels = cfg["labels"]["target_labels"]
    image_size = data_cfg["image_size"]
    arch = cfg["model"]["architecture"]
    
    # Only support transformer architectures
    if arch not in ("swin_tiny", "vit_base"):
        raise ValueError(f"Attention maps only available for transformers (swin_tiny, vit_base), got: {arch}")
    
    # Build model and load checkpoint
    cfg["model"]["pretrained"] = False
    model = build_model(cfg).to(device)
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    print(f"Loaded {arch} from epoch {ckpt['epoch']}", flush=True)
    
    # Prepare input
    tfm = get_valid_transforms(image_size)
    pil_img = Image.open(image_path).convert("RGB")
    input_tensor = tfm(pil_img).unsqueeze(0).to(device)
    
    # Get predictions
    with torch.no_grad():
        logits = model(input_tensor)
        probs = torch.sigmoid(logits).cpu().numpy()[0]
    target_idx = int(np.argmax(probs))
    target_label = target_labels[target_idx]
    
    # Extract attention/saliency map
    print(f"Extracting attention map for {arch}...", flush=True)
    
    try:
        if arch == "vit_base":
            attn_map = get_vit_attention_map(model, input_tensor, image_size)
        else: # swin_tiny
            attn_map = get_swin_gradient_map(model, input_tensor, target_idx=target_idx)
    except RuntimeError as e:
        print(f"[FAIL] Error: {e}", flush=True)
        raise
    
    if attn_map is None:
        raise RuntimeError(f"Failed to extract attention map for {arch}. Map is None after extraction.")
    
    # Upsample attention map to match image size
    attn_map_upsampled = cv2.resize(attn_map, (image_size, image_size), interpolation=cv2.INTER_CUBIC)
    
    # Load RGB image for visualization
    rgb_img = _load_image_rgb(image_path, image_size)
    
    # Create figure with original + attention overlay
    fig, axes = plt.subplots(1, 2, figsize=(10, 5))
    
    # Panel 0: original
    axes[0].imshow(rgb_img, cmap="gray")
    axes[0].set_title("Original", fontsize=12)
    axes[0].axis("off")
    
    # Panel 1: attention overlay
    axes[1].imshow(rgb_img, cmap="gray")
    im = axes[1].imshow(attn_map_upsampled, cmap="jet", alpha=0.5)
    method_name = "CLS Attention" if arch == "vit_base" else f"SmoothGrad Saliency ({target_label})"
    axes[1].set_title(f"{method_name}", fontsize=12)
    axes[1].axis("off")
    
    # Add colorbar
    plt.colorbar(im, ax=axes[1], fraction=0.046, pad=0.04)
    
    # Add predictions as text
    pred_lines = []
    for i, label in enumerate(target_labels):
        gt_str = _format_gt_value(true_labels[i]) if true_labels is not None and i < len(true_labels) else "N/A"
        pred_lines.append(f"{label}: GT={gt_str} | p={probs[i]:.3f}")
    pred_text = "\n".join(pred_lines)
    fig.text(0.98, 0.5, pred_text, fontsize=9, ha="left", va="center", 
             bbox=dict(boxstyle="round,pad=0.5", facecolor="white", alpha=0.8))
    
    fig.suptitle(f"Attention Map — {arch}", fontsize=14, y=0.98)
    fig.tight_layout()
    
    # Save
    os.makedirs(output_dir, exist_ok=True)
    parts = image_path.replace("\\", "/").split("/")
    patient_parts = [p for p in parts if p.startswith("patient") or p.startswith("study") or p.startswith("view")]
    basename = "_".join(patient_parts) if patient_parts else os.path.splitext(os.path.basename(image_path))[0]
    basename = basename.replace(".jpg", "").replace(".png", "")
    out_path = os.path.join(output_dir, f"{basename}_{arch}_attention.png")
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved: {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Attention maps for transformer-based CheXpert models.")
    parser.add_argument("--config", required=True, help="Path to YAML config.")
    parser.add_argument("--checkpoint", required=True, help="Path to .pt checkpoint.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--image", help="Path to a single X-ray image.")
    group.add_argument("--index", type=int, help="Pick the Nth image from the test set.")
    parser.add_argument("--output", default="outputs/attention_maps/", help="Output directory.")
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
    
    run_attention_maps(args.config, args.checkpoint, image_path, args.output, true_labels=true_labels)
