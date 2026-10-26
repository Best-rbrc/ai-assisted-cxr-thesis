# Towards Responsible AI-Assisted Radiology

*From Architecture Selection to Explainability, Calibration, Fairness, and Human-AI Collaboration in Chest X-Ray Classification*

This repository contains the code, data, and trained-model artefacts that accompany the bachelor thesis *Towards Responsible AI-Assisted Radiology: From Architecture Selection to Explainability, Calibration, Fairness, and Human-AI Collaboration in Chest X-Ray Classification* by Benjamin Stieger, supervised by Bernhard Bermeitinger, University of St. Gallen (Bachelor of Science in Computer Science, May 2026).

The work has three components:

1. A multi-label chest-X-ray classifier (DenseNet-121, Swin-Tiny, ViT-Base) trained on CheXpert across sixteen runs, with calibration and subgroup-fairness evaluation.
2. Pixel-attribution and transformer-attention explainability maps (Grad-CAM, Integrated Gradients, SHAP, attention rollout, SmoothGrad).
3. A within-subject, four-condition user study run on a custom web app, with 37 participants from medicine, radiology, and adjacent fields.

## Repository layout

| Path | Contents |
|---|---|
| [`src/`](src/) | PyTorch package: `dataset.py`, `model.py`, `train.py`, `evaluate.py`, `ensemble.py`, `utils.py` |
| [`configs/`](configs/) | YAML config per training run (DenseNet, Swin-Tiny, ViT-Base × uncertainty/label-set variants) |
| [`scripts/`](scripts/) | Standalone scripts, grouped by purpose: [`analysis/`](scripts/analysis/), [`verify/`](scripts/verify/), [`plots/`](scripts/plots/), [`xai/`](scripts/xai/), [`data_prep/`](scripts/data_prep/). See *Reproducing the thesis numbers* below |
| [`notebooks/`](notebooks/) | Kaggle/Colab training notebooks and explainability-verification notebook |
| `data/` | User-study CSV exports (not included, available on request; see [Data](#data)) |
| [`outputs/`](outputs/) | Generated saliency maps, calibration plots, fairness tables, and the evaluation/explainability CSVs the `verify/` scripts consume |
| [`checkpoints/`](checkpoints/) | Trained model weights (gitignored; too large) |
| [`frontend/`](frontend/) | React + Supabase web app used to run the study — see [`frontend/README.md`](frontend/README.md) |
| `CheXpert-v1.0-small/` | The chest-X-ray dataset (gitignored; download from Stanford ML Group or Kaggle) |

> **Note on images:** per-patient explanation maps (Grad-CAM, Integrated Gradients, SHAP, attention) and the study case images are derived from CheXpert and are not redistributed in this repository, in line with the CheXpert Research Use Agreement. Aggregate results (metrics, calibration and fairness plots) are included; the per-image maps can be regenerated with the scripts below.

## Setup

### Python (analysis, training, explainability)

```bash
uv sync
```

Requires Python ≥ 3.13. All dependencies are pinned in [`pyproject.toml`](pyproject.toml) and [`uv.lock`](uv.lock).

### Frontend (study app)

```bash
cd frontend
npm install
npm run dev
```

See [`frontend/README.md`](frontend/README.md) for the full development workflow.

## Reproducing the thesis numbers

Every numeric claim in the thesis is produced by one of the scripts in [`scripts/`](scripts/). The two-tier layout is:

- [`scripts/analysis/`](scripts/analysis/) — primary scripts that compute the numbers from raw data.
- [`scripts/verify/`](scripts/verify/) — thin scripts that load the saved outputs of an `analysis/` run (or a model checkpoint) and cross-check every figure against the values quoted in the thesis. Each prints a clean "Flags: (none)" line when the prose still matches the data.

### Primary analysis

```bash
# All derived user-study numbers used in Chapter 4 (Results)
uv run python -m scripts.analysis.analyze_user_study

# CheXpert label distribution and Run 014 positive weights (Appendix B)
uv run python -m scripts.analysis.chexpert_label_stats

# Post-hoc temperature scaling and ECE for the production model
uv run python -m scripts.analysis.calibrate

# Subgroup-fairness CSV (sex × age × AP/PA)
uv run python -m scripts.analysis.fairness_analysis
```

### Verification against the thesis

```bash
uv run python -m scripts.verify.verify_dataset_splits      # appendix split sizes
uv run python -m scripts.verify.verify_calibration         # tab:brier-scores, T, ECE
uv run python -m scripts.verify.verify_fairness            # tab:fairness-age, tab:fairness-view
uv run python -m scripts.verify.verify_explainability      # tab:xai-metrics + attention entropy
uv run python -m scripts.verify.verify_run_progression     # tab:all-runs (parsed from checkpoint filenames)
uv run python -m scripts.verify.verify_run014_perlabel     # tab:run014-perlabel (needs outputs/run014_test_eval.txt)
uv run python -m scripts.verify.verify_cross_eval          # documents tab:crosseval (requires full CheXpert to reproduce)
```

`verify_run014_perlabel.py` consumes the saved output of one `src.evaluate` run on the production checkpoint (≈7 min on Apple-MPS); see the docstring at the top of that file.

### Figures

```bash
uv run python -m scripts.plots.plot_accuracy_by_role
uv run python -m scripts.plots.plot_pneumo_sensitivity
uv run python -m scripts.plots.plot_xai_helpfulness_matrix
uv run python -m scripts.plots.plot_xai_method_comparison
```

Each plot script imports its data-loading logic from `scripts.analysis.analyze_user_study`, so the figure values are locked to the same source of truth as the prose in the thesis.

## Training a model

```bash
uv run python -m src.train --config configs/densenet121_6labels.yaml
```

Phase-by-phase config naming mirrors the run table in the thesis (Run 014 = `densenet121_6labels.yaml`).

## Explainability maps

Per-image visualisations for the production model:

```bash
uv run python -m scripts.xai.gradcam \
  --config configs/densenet121_6labels.yaml \
  --checkpoint checkpoints/densenet121/run014_densenet121_6labels_ep09_val0.8038_test0.8361.pt \
  --index 1 --output outputs/gradcam/

uv run python -m scripts.xai.attention_maps  ...   # Swin-Tiny SmoothGrad attention rollout
uv run python -m scripts.xai.integrated_gradients ...
uv run python -m scripts.xai.shap_analysis ...
uv run python -m scripts.xai.compute_explainability_metrics
```

## Dataset preparation

One-time CSV splits for the CheXpert training pipeline:

```bash
uv run python -m scripts.data_prep.split_train_test   # train.csv → train_split.csv + test.csv
uv run python -m scripts.data_prep.create_val_split   # train_split.csv → train_proper.csv + val_proper.csv
```

## Data

The raw user-study data (per-participant sessions, trial responses and NASA-TLX / trust surveys) is **not included** in this public repository to protect participant privacy. Aggregated results are reported in the thesis.

The analysis pipeline (`scripts/analysis/analyze_user_study.py`) expects three CSV exports in `data/`:

- `study_sessions_rows-5.csv`: one row per participant session
- `study_trials_rows-5.csv`: per-trial responses
- `study_block_surveys_rows-5.csv`: NASA-TLX and trust-pulse responses between condition blocks

The anonymised data is available from the author on reasonable request for research purposes.

