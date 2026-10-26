"""Ensemble evaluation: average predictions from multiple models."""

import argparse
import os

import numpy as np
import torch
import torch.nn as nn
from tqdm import tqdm

from src.dataset import CheXpertDataset, get_valid_transforms
from src.model import build_model
from src.utils import compute_aurocs, get_device, load_config


def _collect_predictions(
    cfg: dict,
    checkpoint_path: str,
    dataset: CheXpertDataset,
    device: torch.device,
) -> np.ndarray:
    """Run inference with one model and return prediction array."""
    model = build_model(cfg).to(device)
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    arch = cfg["model"]["architecture"]
    loader = torch.utils.data.DataLoader(
        dataset,
        batch_size=cfg["training"]["batch_size"],
        shuffle=False,
        num_workers=0,
        pin_memory=device.type == "cuda",
    )

    all_preds = []
    with torch.no_grad():
        for images, _ in tqdm(loader, desc=f"  {arch}"):
            images = images.to(device, non_blocking=True)
            probs = torch.sigmoid(model(images))
            all_preds.append(probs.cpu().numpy())

    del model
    torch.cuda.empty_cache() if device.type == "cuda" else None
    return np.concatenate(all_preds)


def ensemble_evaluate(
    config_checkpoint_pairs: list[tuple[str, str]],
    split: str = "test",
) -> None:
    """Average predictions from multiple (config, checkpoint) pairs."""
    first_cfg = load_config(config_checkpoint_pairs[0][0])
    device = get_device(first_cfg)
    data_cfg = first_cfg["data"]
    target_labels = first_cfg["labels"]["target_labels"]

    csv_path = data_cfg["test_csv"] if split == "test" else data_cfg["valid_csv"]
    split_name = "TEST (held-out)" if split == "test" else "Validation"

    # Use the first model's image size for the shared dataset
    image_size = data_cfg["image_size"]
    dataset = CheXpertDataset(
        csv_path=csv_path,
        data_dir=data_cfg["data_dir"],
        target_labels=target_labels,
        transform=get_valid_transforms(image_size),
        frontal_only=data_cfg["frontal_only"],
        uncertainty_strategy="u-ones",
    )
    print(f"{split_name} samples: {len(dataset):,}")

    labels_arr = dataset.labels

    all_model_preds = []
    for config_path, ckpt_path in config_checkpoint_pairs:
        cfg = load_config(config_path)
        cfg_img_size = cfg["data"]["image_size"]

        if cfg_img_size != image_size:
            dataset.transform = get_valid_transforms(cfg_img_size)

        preds = _collect_predictions(cfg, ckpt_path, dataset, device)
        all_model_preds.append(preds)
        print(f"    → {os.path.basename(ckpt_path)} loaded")

        if cfg_img_size != image_size:
            dataset.transform = get_valid_transforms(image_size)

    ensemble_preds = np.mean(all_model_preds, axis=0)

    aurocs = compute_aurocs(labels_arr, ensemble_preds, target_labels)
    mean_auroc = float(np.nanmean(list(aurocs.values())))

    n = len(config_checkpoint_pairs)
    print(f"\n{'─' * 50}")
    print(f"  ENSEMBLE ({n} models) — {split_name}")
    print(f"  Mean AUROC: {mean_auroc:.4f}")
    print(f"{'─' * 50}")
    for label, auc in aurocs.items():
        print(f"  {label:30s}  {auc:.4f}")
    print(f"{'─' * 50}")

    # Also print individual model results for comparison
    for i, ((cfg_path, _), preds) in enumerate(
        zip(config_checkpoint_pairs, all_model_preds)
    ):
        cfg = load_config(cfg_path)
        arch = cfg["model"]["architecture"]
        ind_aurocs = compute_aurocs(labels_arr, preds, target_labels)
        ind_mean = float(np.nanmean(list(ind_aurocs.values())))
        print(f"  (individual) {arch:20s}  {ind_mean:.4f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ensemble evaluation")
    parser.add_argument(
        "--models",
        nargs="+",
        required=True,
        help="Pairs of config:checkpoint, e.g. configs/swin_tiny.yaml:checkpoints/swin.pt",
    )
    parser.add_argument("--split", default="test", choices=["valid", "test"])
    args = parser.parse_args()

    pairs = []
    for m in args.models:
        config_path, ckpt_path = m.split(":")
        pairs.append((config_path, ckpt_path))

    ensemble_evaluate(pairs, split=args.split)
