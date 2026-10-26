"""Shared utilities: config loading, device selection, metrics."""

import os

import numpy as np
import torch
import torch.nn as nn
import yaml
from sklearn.metrics import f1_score, roc_auc_score


def load_config(path: str = "configs/train_config.yaml") -> dict:
    """Load a YAML config file and return it as a dict."""
    with open(path) as f:
        return yaml.safe_load(f)


def get_device(cfg: dict) -> torch.device:
    """Select the best available device based on config.

    Priority: CUDA > MPS (Apple Silicon) > CPU.
    """
    requested = cfg.get("device", "auto")

    if requested != "auto":
        return torch.device(requested)

    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def compute_aurocs(
    y_true,
    y_pred,
    label_names: list[str],
) -> dict[str, float]:
    """Compute per-label AUROC scores.

    Uncertain labels encoded as -1 (u-mask strategy) are excluded from the
    AUROC calculation for that label.

    Args:
        y_true: Ground-truth labels, shape (N, C).  May contain -1 for uncertain.
        y_pred: Predicted probabilities, shape (N, C).
        label_names: Names corresponding to each column.

    Returns:
        Dict mapping label name → AUROC. Labels where AUROC cannot be
        computed (e.g. only one class present) are mapped to NaN.
    """
    aurocs = {}
    for i, name in enumerate(label_names):
        col_true = y_true[:, i]
        col_pred = y_pred[:, i]
        certain = col_true >= 0  # exclude uncertain (-1) labels
        try:
            aurocs[name] = roc_auc_score(col_true[certain], col_pred[certain])
        except ValueError:
            aurocs[name] = float("nan")
    return aurocs


def compute_f1s(
    y_true,
    y_pred_proba,
    label_names: list[str],
    threshold: float = 0.5,
) -> dict[str, dict]:
    """Compute per-label F1 scores at a fixed threshold and an optimal threshold.

    The optimal threshold per label maximises Youden's J (sensitivity + specificity - 1)
    evaluated on the same data that is passed in.  For proper model selection this should
    be the *validation* set; for test-set reporting pass test predictions.

    Uncertain labels encoded as -1 are excluded from every calculation.

    Args:
        y_true: Ground-truth array, shape (N, C).  May contain -1 for uncertain.
        y_pred_proba: Predicted probabilities, shape (N, C).
        label_names: Names corresponding to each column.
        threshold: Fixed threshold used for f1_05.  Default 0.5.

    Returns:
        Dict mapping label name → {"f1_05": float, "f1_opt": float, "thresh_opt": float}.
        Labels where F1 cannot be computed are mapped to NaN.
    """
    results = {}
    for i, name in enumerate(label_names):
        col_true = y_true[:, i]
        col_pred = y_pred_proba[:, i]
        mask = col_true >= 0  # exclude uncertain (-1)
        ct = col_true[mask].astype(int)
        cp = col_pred[mask]

        if len(np.unique(ct)) < 2:
            results[name] = {"f1_05": float("nan"), "f1_opt": float("nan"), "thresh_opt": float("nan")}
            continue

        # Fixed threshold
        try:
            f1_fixed = f1_score(ct, (cp >= threshold).astype(int), zero_division=0)
        except Exception:
            f1_fixed = float("nan")

        # Optimal threshold via Youden's J sweep
        best_thresh, best_j = threshold, -1.0
        for t in np.linspace(0.05, 0.95, 181):
            preds_t = (cp >= t).astype(int)
            tp = np.sum((preds_t == 1) & (ct == 1))
            tn = np.sum((preds_t == 0) & (ct == 0))
            fp = np.sum((preds_t == 1) & (ct == 0))
            fn = np.sum((preds_t == 0) & (ct == 1))
            sens = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            spec = tn / (tn + fp) if (tn + fp) > 0 else 0.0
            j = sens + spec - 1.0
            if j > best_j:
                best_j = j
                best_thresh = t
        try:
            f1_opt = f1_score(ct, (cp >= best_thresh).astype(int), zero_division=0)
        except Exception:
            f1_opt = float("nan")

        results[name] = {"f1_05": f1_fixed, "f1_opt": f1_opt, "thresh_opt": best_thresh}
    return results


class TemperatureScaler(nn.Module):
    """Post-hoc calibration via temperature scaling (Guo et al., 2017).

    Wraps a trained model and divides its logits by a single learned scalar T.
    A T > 1 softens the distribution (makes the model less confident);
    T < 1 sharpens it.

    Usage::

        scaler = TemperatureScaler(model)
        scaler.fit(val_logits, val_labels)  # learns T on validation set
        probs = torch.sigmoid(scaler(images) / scaler.temperature.item())
    """

    def __init__(self, model: nn.Module) -> None:
        super().__init__()
        self.model = model
        self.temperature = nn.Parameter(torch.ones(1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # type: ignore[override]
        return self.model(x) / self.temperature

    # ------------------------------------------------------------------
    # Calibration fitting
    # ------------------------------------------------------------------

    def fit(
        self,
        logits: torch.Tensor,
        labels: torch.Tensor,
        max_iter: int = 50,
    ) -> float:
        """Optimise temperature on pre-collected *validation* logits.

        Args:
            logits: Raw (pre-sigmoid) logits, shape (N, C).
            labels: Ground-truth labels in {0, 1}, shape (N, C).
                    Uncertain entries (-1) are masked out.
            max_iter: Max LBFGS iterations.

        Returns:
            Optimised temperature value.
        """
        self.temperature.data.fill_(1.0)
        # Mask uncertain labels
        mask = labels >= 0
        logits_m = logits[mask]
        labels_m = labels[mask].float()

        criterion = nn.BCEWithLogitsLoss()
        optimizer = torch.optim.LBFGS([self.temperature], lr=0.01, max_iter=max_iter)

        def _eval():
            optimizer.zero_grad()
            loss = criterion(logits_m / self.temperature, labels_m)
            loss.backward()
            return loss

        optimizer.step(_eval)
        # Clamp temperature to a reasonable range
        with torch.no_grad():
            self.temperature.clamp_(0.1, 10.0)
        return self.temperature.item()

    # ------------------------------------------------------------------
    # Calibration metrics
    # ------------------------------------------------------------------

    @staticmethod
    def compute_ece(
        probs: np.ndarray,
        labels: np.ndarray,
        n_bins: int = 15,
    ) -> float:
        """Expected Calibration Error (multi-label: flattened).

        Uncertain labels (-1) are excluded.  Computes ECE over all
        (sample, class) pairs jointly.

        Args:
            probs: Predicted probabilities, shape (N, C).
            labels: Ground-truth labels, shape (N, C).  May contain -1.
            n_bins: Number of equally-spaced confidence bins.

        Returns:
            Scalar ECE value.
        """
        mask = labels >= 0
        p = probs[mask].ravel()
        y = labels[mask].ravel().astype(int)

        bins = np.linspace(0.0, 1.0, n_bins + 1)
        ece = 0.0
        n = len(p)
        for lo, hi in zip(bins[:-1], bins[1:]):
            in_bin = (p >= lo) & (p < hi)
            if in_bin.sum() == 0:
                continue
            acc = y[in_bin].mean()
            conf = p[in_bin].mean()
            ece += (in_bin.sum() / n) * abs(acc - conf)
        return float(ece)

    @staticmethod
    def compute_brier(
        probs: np.ndarray,
        labels: np.ndarray,
        label_names: list[str],
    ) -> dict[str, float]:
        """Per-label Brier score.  Uncertain entries (-1) are excluded."""
        scores = {}
        for i, name in enumerate(label_names):
            col_true = labels[:, i]
            col_pred = probs[:, i]
            mask = col_true >= 0
            if mask.sum() == 0:
                scores[name] = float("nan")
            else:
                scores[name] = float(np.mean((col_pred[mask] - col_true[mask]) ** 2))
        return scores


def save_checkpoint(
    model: torch.nn.Module,
    optimizer: torch.optim.Optimizer,
    epoch: int,
    auroc: float,
    path: str,
    *,
    scheduler=None,
    scaler=None,
    best_auroc: float | None = None,
    patience_counter: int | None = None,
) -> None:
    """Save a training checkpoint (enough state to resume later)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = {
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "auroc": auroc,
    }
    if scheduler is not None:
        payload["scheduler_state_dict"] = scheduler.state_dict()
    if scaler is not None:
        payload["scaler_state_dict"] = scaler.state_dict()
    if best_auroc is not None:
        payload["best_auroc"] = best_auroc
    if patience_counter is not None:
        payload["patience_counter"] = patience_counter
    torch.save(payload, path)
