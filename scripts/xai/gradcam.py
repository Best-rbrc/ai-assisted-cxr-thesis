"""Grad-CAM heatmap visualization for CheXpert models.

Generates a figure with the original X-ray and one Grad-CAM overlay per
pathology label, showing which image regions the model focuses on.

Usage (from project root):
  uv run python -m scripts.gradcam \
    --config CONFIG --checkpoint CHECKPOINT \
    --image PATH_TO_IMAGE \
    --output outputs/gradcam/

  # Or use --index N to pick the Nth image from the test set:
  uv run python -m scripts.gradcam \
    --config CONFIG --checkpoint CHECKPOINT \
    --index 42 --output outputs/gradcam/
"""

import argparse
import os

import cv2
import matplotlib.cm as cm
import matplotlib.pyplot as plt
import numpy as np
import torch
from PIL import Image
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget

from src.dataset import get_cxr_valid_transforms, get_valid_transforms
from src.model import build_model
from src.utils import get_device, load_config


def _label_to_slug(label: str) -> str:
    """Convert model label name to frontend finding ID (e.g. 'Pleural Effusion' → 'pleural_effusion')."""
    return label.lower().replace(" ", "_")


def _save_overlay_png(heatmap: np.ndarray, output_path: str, colormap: str = "jet") -> None:
    """Save a per-finding heatmap as a transparent RGBA PNG overlay.

    The alpha channel is set proportional to heatmap intensity so that
    zero-activation regions are fully transparent and can be composited
    over the original X-ray in the frontend using mix-blend-mode: screen.
    """
    cmap = cm.get_cmap(colormap)
    rgba = cmap(heatmap).astype(np.float64)          # (H, W, 4) in [0, 1]
    rgba[:, :, 3] = np.clip(heatmap * 1.5, 0.0, 1.0) # boost alpha slightly for visibility
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


def _get_target_layer_and_reshape(model, arch: str, img_size: int):
    """Return (target_layers, reshape_transform) for the given architecture."""
    if arch in ("densenet121", "densenet121_cxr"):
        # Last conv layer in DenseNet
        target_layers = [model.features.denseblock4.denselayer16.conv2]
        return target_layers, None

    if arch == "resnet50":
        target_layers = [model.layer4[-1].conv3]
        return target_layers, None

    if arch == "swin_tiny":
        target_layers = [model.norm]  # output is (B, H, W, C)
        def reshape(tensor):
            if tensor.ndim == 4:
                # (B, H, W, C) → permute to (B, C, H, W) so the library treats H,W as spatial
                return tensor.permute(0, 3, 1, 2)
            B, N, C = tensor.shape
            h = w = int(N ** 0.5)
            return tensor.reshape(B, h, w, C).permute(0, 3, 1, 2)
        return target_layers, reshape

    if arch == "vit_base":
        target_layers = [model.blocks[-1].norm1]
        grid = img_size // 16  # ViT patch size = 16
        def reshape(tensor, height=grid, width=grid):
            # ViT has a CLS token at position 0 — remove it
            B, N, C = tensor.shape
            return tensor[:, 1:, :].reshape(B, height, width, C)
        return target_layers, reshape

    raise ValueError(f"Unsupported architecture for Grad-CAM: {arch}")


def _load_image_rgb(path: str, image_size: int) -> np.ndarray:
    """Load an image and return it as a float32 RGB array in [0, 1] for overlay."""
    img = Image.open(path).convert("RGB")
    img = img.resize((image_size, image_size), Image.BILINEAR)
    return np.array(img).astype(np.float32) / 255.0


def run_gradcam(
    config_path: str,
    checkpoint_path: str,
    image_path: str,
    output_dir: str,
    true_labels: list[float] | None = None,
    study_overlays: bool = False,
    labels_filter: list[str] | None = None,
) -> None:
    """Generate Grad-CAM visualizations.

    When study_overlays=True, saves individual transparent RGBA PNG overlays
    per finding (no composite figure) suitable for frontend display.
    When False (default), saves the original composite matplotlib figure.
    """
    cfg = load_config(config_path)
    device = get_device(cfg)
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

    # Prepare transforms and input tensor
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

    # RGB image for overlay (always RGB regardless of model input)
    rgb_img = _load_image_rgb(image_path, image_size)

    # Grad-CAM setup
    target_layers, reshape_fn = _get_target_layer_and_reshape(model, arch, image_size)
    cam = GradCAM(model=model, target_layers=target_layers, reshape_transform=reshape_fn)

    # Build descriptive basename from patient path
    os.makedirs(output_dir, exist_ok=True)
    parts = image_path.replace("\\", "/").split("/")
    patient_parts = [p for p in parts if p.startswith("patient") or p.startswith("study") or p.startswith("view")]
    basename = "_".join(patient_parts) if patient_parts else os.path.splitext(os.path.basename(image_path))[0]
    basename = basename.replace(".jpg", "").replace(".png", "")

    if study_overlays:
        # --- Per-finding transparent RGBA PNGs for frontend overlay ---
        # Resize heatmap to original image dimensions so it aligns correctly
        # when both X-ray and overlay are shown with CSS object-contain.
        orig_w, orig_h = Image.open(image_path).size
        for i, label in enumerate(target_labels):
            targets = [ClassifierOutputTarget(i)]
            grayscale_cam = cam(input_tensor=input_tensor, targets=targets)[0]
            grayscale_cam_orig = cv2.resize(grayscale_cam, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
            slug = _label_to_slug(label)
            out_path = os.path.join(output_dir, f"{basename}_gradcam_{slug}.png")
            _save_overlay_png(grayscale_cam_orig, out_path, colormap="jet")
            print(f"Saved: {out_path}")
    else:
        # --- Original composite matplotlib figure (research use) ---
        if labels_filter:
            selected = [(i, l) for i, l in enumerate(target_labels) if l in labels_filter]
            if not selected:
                raise ValueError(f"None of --labels {labels_filter} matched target_labels {target_labels}")
            suffix = "_" + "_".join(_label_to_slug(l) for _, l in selected)
        else:
            selected = list(enumerate(target_labels))
            suffix = ""

        n_panels = len(selected) + 1
        fig, axes = plt.subplots(1, n_panels, figsize=(4 * n_panels, 4))

        axes[0].imshow(rgb_img, cmap="gray")
        axes[0].set_title("Original", fontsize=11)
        axes[0].axis("off")

        for j, (i, label) in enumerate(selected):
            targets = [ClassifierOutputTarget(i)]
            grayscale_cam = cam(input_tensor=input_tensor, targets=targets)[0]
            overlay = show_cam_on_image(rgb_img, grayscale_cam, use_rgb=True)
            axes[j + 1].imshow(overlay)
            gt_str = _format_gt_value(true_labels[i]) if true_labels is not None and i < len(true_labels) else "N/A"
            axes[j + 1].set_title(f"{label}\nGT={gt_str} | p={probs[i]:.3f}", fontsize=10)
            axes[j + 1].axis("off")

        fig.suptitle(f"Grad-CAM — {arch}", fontsize=13, y=1.02)
        fig.tight_layout()
        out_path = os.path.join(output_dir, f"{basename}_{arch}_gradcam{suffix}.png")
        fig.savefig(out_path, dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"Saved: {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Grad-CAM heatmaps for CheXpert models.")
    parser.add_argument("--config", required=True, help="Path to YAML config.")
    parser.add_argument("--checkpoint", required=True, help="Path to .pt checkpoint.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--image", help="Path to a single X-ray image.")
    group.add_argument("--index", type=int, help="Pick the Nth image from the test set.")
    parser.add_argument("--output", default="outputs/gradcam/", help="Output directory.")
    parser.add_argument("--study-overlays", action="store_true",
                        help="Save individual transparent RGBA PNGs per finding instead of composite figure.")
    parser.add_argument("--labels", default=None,
                        help="Comma-separated subset of target labels to render in the composite figure "
                             "(e.g. 'Cardiomegaly,Pneumothorax'). Default: all labels.")
    args = parser.parse_args()
    labels_filter = [l.strip() for l in args.labels.split(",")] if args.labels else None

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

    run_gradcam(args.config, args.checkpoint, image_path, args.output,
                true_labels=true_labels, study_overlays=args.study_overlays,
                labels_filter=labels_filter)
