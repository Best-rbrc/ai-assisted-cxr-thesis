"""CheXpert dataset and data loading utilities."""

import os

import pandas as pd
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms


# The 14 pathology columns in the CheXpert CSV (in order)
ALL_LABELS = [
    "No Finding",
    "Enlarged Cardiomediastinum",
    "Cardiomegaly",
    "Lung Opacity",
    "Lung Lesion",
    "Edema",
    "Consolidation",
    "Pneumonia",
    "Atelectasis",
    "Pneumothorax",
    "Pleural Effusion",
    "Pleural Other",
    "Fracture",
    "Support Devices",
]

# The 5 competition pathologies
COMPETITION_LABELS = [
    "Cardiomegaly",
    "Edema",
    "Consolidation",
    "Atelectasis",
    "Pleural Effusion",
]


class CheXpertDataset(Dataset):
    """PyTorch Dataset for the CheXpert-Small chest X-ray dataset.

    Handles:
    - Loading images from disk based on CSV paths
    - Filtering to frontal views (optional)
    - Mapping uncertain labels (-1) via a configurable strategy
    - Selecting a subset of target labels
    """

    def __init__(
        self,
        csv_path: str,
        data_dir: str,
        target_labels: list[str] | None = None,
        transform: transforms.Compose | None = None,
        frontal_only: bool = True,
        uncertainty_strategy: str = "u-ones",
        per_label_strategies: dict[str, str] | None = None,
    ):
        """Initialise the CheXpert dataset.

        Args:
            csv_path: Path to the CheXpert CSV (train.csv or valid.csv).
            data_dir: Root directory that contains the images. The CSV `Path`
                column values are resolved relative to the *parent* of this
                directory (i.e. the workspace root).
            target_labels: Which pathology columns to use as targets.
                Defaults to the 5 competition labels.
            transform: torchvision transforms to apply to each image.
            frontal_only: If True, keep only frontal-view images.
            uncertainty_strategy: Global fallback for uncertain labels (-1).
                "u-ones"   → map -1 → 1  (treat uncertain as positive)
                "u-zeros"  → map -1 → 0  (treat uncertain as negative)
                "u-ignore" → map -1 → 0  (same as u-zeros for BCE)
                "u-mask"   → keep -1 as -1 so loss masks it; NaN → 0 (implicit neg)
                "nan-mask" → NaN AND -1 both → -1 so loss masks them; only
                             explicit 0/1 labels contribute to loss.  Use for
                             labels with very high NaN rates (e.g. Fracture 94%)
                             where treating NaN as negative floods training with
                             false negatives.
                "u-mixed"  → use per_label_strategies dict per label
            per_label_strategies: Per-label override dict, e.g.
                {"Consolidation": "u-ones", "Cardiomegaly": "u-zeros"}.
                Only used when uncertainty_strategy == "u-mixed" or as
                label-level overrides on top of the global strategy.
        """
        self.data_dir = data_dir
        self.target_labels = target_labels or COMPETITION_LABELS
        self.transform = transform
        self.uncertainty_strategy = uncertainty_strategy
        self.per_label_strategies = per_label_strategies or {}

        # ── Load & filter the CSV ──
        df = pd.read_csv(csv_path)

        if frontal_only:
            df = df[df["Frontal/Lateral"] == "Frontal"]

        df = df.reset_index(drop=True)

        # ── Handle uncertainty labels ──
        for col in self.target_labels:
            # Per-label strategy overrides the global strategy for this column
            col_strategy = self.per_label_strategies.get(col, uncertainty_strategy)

            if col_strategy == "u-ones":
                df[col] = df[col].fillna(0.0).replace(-1.0, 1.0)
            elif col_strategy in ("u-zeros", "u-ignore"):
                df[col] = df[col].fillna(0.0).replace(-1.0, 0.0)
            elif col_strategy == "u-mask":
                # NaN (not mentioned) → 0  (implicit negative)
                # -1  (uncertain)     → kept as -1 so the loss function can mask it
                df[col] = df[col].fillna(0.0)
            elif col_strategy == "nan-mask":
                # NaN (not mentioned) → -1  (masked, same as uncertain)
                # -1  (uncertain)     → -1  (masked)
                # Only explicit 0/1 labels contribute to the loss.
                # Use for labels with very high NaN rates (e.g. Fracture ~94%)
                # where NaN-as-0 would flood training with false negatives.
                df[col] = df[col].fillna(-1.0)
            elif col_strategy == "u-mixed":
                raise ValueError(
                    f'"u-mixed" is not valid as a per-label strategy for {col!r}. '
                    "Use it only as the global strategy with per_label_strategies."
                )
            else:
                raise ValueError(
                    f"Unknown uncertainty strategy {col_strategy!r} for label {col!r}. "
                    "Choose from: u-ones, u-zeros, u-ignore, u-mask, nan-mask"
                )

        self.df = df
        self.labels = df[self.target_labels].values.astype("float32")

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        row = self.df.iloc[idx]
        raw_path = row["Path"]

        # CSV path is like "CheXpert-v1.0-small/train/patient…/…/view.jpg"
        if os.path.isabs(self.data_dir):
            # Kaggle etc.: data_dir is full path to dataset root; drop first path segment
            rel = raw_path.split("/", 1)[1] if "/" in raw_path else raw_path
            img_path = os.path.join(self.data_dir, rel)
        else:
            img_path = os.path.join(os.path.dirname(self.data_dir), raw_path)
        color_mode = "L" if getattr(self, "grayscale", False) else "RGB"
        image = Image.open(img_path).convert(color_mode)

        if self.transform:
            image = self.transform(image)

        label = torch.tensor(self.labels[idx], dtype=torch.float32)
        return image, label


# ─── Class-weight utility ────────────────────────────────────────────────────


def compute_pos_weights(
    csv_path: str,
    target_labels: list[str],
    frontal_only: bool = True,
    per_label_strategies: dict[str, str] | None = None,
    global_strategy: str = "u-zeros",
) -> torch.Tensor:
    """Compute pos_weight for BCEWithLogitsLoss from class frequencies.

    pos_weight[i] = num_negative[i] / num_positive[i]

    Uncertain labels (-1) are resolved using the same strategy as training so
    the weight reflects the actual label distribution seen by the model.

    Args:
        csv_path: Path to the training CSV.
        target_labels: Ordered list of label column names.
        frontal_only: Keep only frontal views (should match training).
        per_label_strategies: Per-label uncertainty strategies.
        global_strategy: Fallback strategy for labels not in per_label_strategies.

    Returns:
        Float tensor of shape [num_labels] with pos_weight[i] >= 1.
    """
    per_label_strategies = per_label_strategies or {}
    df = pd.read_csv(csv_path)
    if frontal_only:
        df = df[df["Frontal/Lateral"] == "Frontal"]

    weights = []
    for col in target_labels:
        strategy = per_label_strategies.get(col, global_strategy)

        if strategy == "nan-mask":
            # Only count explicitly labeled rows (0 or 1); exclude NaN and
            # uncertain (-1) since both are masked in the loss.
            labeled = df[col].dropna()
            labeled = labeled[labeled != -1.0]
            n_pos = float((labeled > 0.5).sum())
            n_neg = float((labeled <= 0.5).sum())
        else:
            series = df[col].fillna(0.0)
            if strategy == "u-ones":
                series = series.replace(-1.0, 1.0)
            elif strategy in ("u-zeros", "u-ignore", "u-mask"):
                series = series.replace(-1.0, 0.0)
            n_pos = float((series > 0.5).sum())
            n_neg = float((series <= 0.5).sum())

        n_pos = max(n_pos, 1.0)  # avoid division by zero
        n_neg = max(n_neg, 1.0)
        weights.append(n_neg / n_pos)
        print(f"  pos_weight [{col}]: {n_neg/n_pos:.2f}  "
              f"(pos={int(n_pos):,}  neg={int(n_neg):,})")

    return torch.tensor(weights, dtype=torch.float32)


# ─── Transforms ─────────────────────────────────────────────────────────────


def get_train_transforms(image_size: int = 320) -> transforms.Compose:
    """Training-time augmentations (radiology-safe: no ColorJitter/Erasing)."""
    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(10),
            transforms.RandomAffine(degrees=0, translate=(0.05, 0.05)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ]
    )


def get_valid_transforms(image_size: int = 320) -> transforms.Compose:
    """Validation-time transforms (deterministic)."""
    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ]
    )


# ─── CXR-specific transforms (torchxrayvision) ─────────────────────────────


def get_cxr_train_transforms(image_size: int = 224) -> transforms.Compose:
    """Training transforms for CXR-pretrained models (grayscale, xrv normalization)."""
    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(10),
            transforms.RandomAffine(degrees=0, translate=(0.05, 0.05)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.5], std=[0.5]),
        ]
    )


def get_cxr_valid_transforms(image_size: int = 224) -> transforms.Compose:
    """Validation transforms for CXR-pretrained models (grayscale, xrv normalization)."""
    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.5], std=[0.5]),
        ]
    )


# ─── DataLoader helpers ─────────────────────────────────────────────────────


def build_dataloaders(
    cfg: dict,
    *,
    pin_memory: bool = True,
) -> tuple[DataLoader, DataLoader]:
    """Build train and validation DataLoaders from a config dict.

    Args:
        cfg: Parsed YAML config (see configs/train_config.yaml).
        pin_memory: Set False on MPS to avoid warning; True on CUDA for speed.

    Returns:
        (train_loader, valid_loader)
    """
    data_cfg = cfg["data"]
    label_cfg = cfg["labels"]
    train_cfg = cfg["training"]

    image_size = data_cfg["image_size"]
    target_labels = label_cfg["target_labels"]
    use_cxr = data_cfg.get("cxr_pretrained", False)

    if use_cxr:
        train_tfm = get_cxr_train_transforms(image_size)
        valid_tfm = get_cxr_valid_transforms(image_size)
    else:
        train_tfm = get_train_transforms(image_size)
        valid_tfm = get_valid_transforms(image_size)

    per_label_strategies = data_cfg.get("per_label_strategies", {})

    train_dataset = CheXpertDataset(
        csv_path=data_cfg["train_csv"],
        data_dir=data_cfg["data_dir"],
        target_labels=target_labels,
        transform=train_tfm,
        frontal_only=data_cfg["frontal_only"],
        uncertainty_strategy=data_cfg["uncertainty_strategy"],
        per_label_strategies=per_label_strategies,
    )
    train_dataset.grayscale = use_cxr

    valid_dataset = CheXpertDataset(
        csv_path=data_cfg["valid_csv"],
        data_dir=data_cfg["data_dir"],
        target_labels=target_labels,
        transform=valid_tfm,
        frontal_only=data_cfg["frontal_only"],
        uncertainty_strategy="u-ones",
    )
    valid_dataset.grayscale = use_cxr

    nw = train_cfg["num_workers"]

    train_loader = DataLoader(
        train_dataset,
        batch_size=train_cfg["batch_size"],
        shuffle=True,
        num_workers=nw,
        pin_memory=pin_memory,
        drop_last=True,
        persistent_workers=nw > 0,
    )

    valid_loader = DataLoader(
        valid_dataset,
        batch_size=train_cfg["batch_size"],
        shuffle=False,
        num_workers=nw,
        pin_memory=pin_memory,
        persistent_workers=nw > 0,
    )

    return train_loader, valid_loader
