"""Compose the appendix three-method XAI comparison figure.

Stacks the per-label Grad-CAM, Integrated Gradients, and SHAP panels for
patient 00082 (the low-pathology case used in the results case study) so a
reader can visually verify the cross-method agreement reported in
Table 4.X (IoU, SSIM, Pearson). Each source PNG already encodes a row of
per-label panels with the Original frame as the first cell; we crop the
Original from rows 2 and 3 so the X-ray is not repeated three times, then
left-align all three rows on the same first-label edge.

Usage (from project root):
  uv run python -m scripts.plot_xai_method_comparison
"""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
GRADCAM = ROOT / "outputs" / "gradcam" / "patient00082_study1_view1_frontal_densenet121_gradcam.png"
IG = ROOT / "outputs" / "integrated_gradients" / "patient00082_study1_view1_frontal_densenet121_ig.png"
SHAP = ROOT / "outputs" / "shap" / "patient00082_study1_view1_frontal_densenet121_shap.png"
OUTPUT = ROOT / "HSG-bachelor-thesis" / "graphics" / "fig_xai_method_comparison.pdf"


def crop_first_panel(img: Image.Image, n_panels: int) -> Image.Image:
    """Drop the leftmost panel (the Original X-ray)."""
    w, h = img.size
    panel_w = w // n_panels
    return img.crop((panel_w, 0, w, h))


def main() -> None:
    gc = Image.open(GRADCAM)        # 7 panels: Original + 6 labels
    ig = Image.open(IG)             # 6 panels: Original + 5 labels
    sh = Image.open(SHAP)           # 6 panels: Original + 5 labels

    # Drop Pneumothorax (last panel) from Grad-CAM so all rows show the same 5 labels.
    gc_w, gc_h = gc.size
    gc_panel = gc_w // 7
    gc = gc.crop((0, 0, gc_panel * 6, gc_h))  # Original + first 5 labels

    # Drop the Original panel from IG and SHAP (already shown in Grad-CAM row).
    ig_cropped = crop_first_panel(ig, 6)
    sh_cropped = crop_first_panel(sh, 6)

    # Pad IG/SHAP on the left with whitespace equal to the Original-panel width of
    # Grad-CAM so the five label columns align across rows.
    target_w = gc.size[0]  # gc_panel * 6
    label_w = gc_panel * 5
    left_pad = target_w - label_w  # equals gc_panel — the Original-cell width

    def pad_left(img: Image.Image, pad: int, total_w: int) -> Image.Image:
        # Resize the cropped row so its width matches total_w - pad.
        scale = (total_w - pad) / img.size[0]
        new_size = (total_w - pad, int(round(img.size[1] * scale)))
        resized = img.resize(new_size, Image.LANCZOS)
        canvas = Image.new("RGB", (total_w, new_size[1]), "white")
        canvas.paste(resized, (pad, 0))
        return canvas

    ig_row = pad_left(ig_cropped, left_pad, target_w)
    sh_row = pad_left(sh_cropped, left_pad, target_w)

    # Resize Grad-CAM row to a consistent panel height (use the smaller height for sharpness).
    row_h = min(gc.size[1], ig_row.size[1], sh_row.size[1])
    def rescale_h(img: Image.Image, h: int) -> Image.Image:
        scale = h / img.size[1]
        return img.resize((int(round(img.size[0] * scale)), h), Image.LANCZOS)

    gc_row = rescale_h(gc, row_h)
    ig_row = rescale_h(ig_row, row_h)
    sh_row = rescale_h(sh_row, row_h)

    fig_w = 12.0  # inches
    aspect = row_h / gc_row.size[0]
    row_h_in = fig_w * aspect

    fig, axes = plt.subplots(3, 1, figsize=(fig_w, row_h_in * 3 + 0.6))
    for ax, img, label in zip(
        axes,
        [gc_row, ig_row, sh_row],
        ["(a) Grad-CAM", "(b) Integrated Gradients", "(c) SHAP (DeepExplainer)"],
    ):
        ax.imshow(img)
        ax.set_axis_off()
        ax.text(
            0.005,
            0.5,
            label,
            transform=ax.transAxes,
            rotation=90,
            va="center",
            ha="right",
            fontsize=9,
        )

    plt.subplots_adjust(left=0.04, right=0.995, top=0.99, bottom=0.01, hspace=0.05)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUTPUT, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
