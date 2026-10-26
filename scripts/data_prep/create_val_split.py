"""Split train_split.csv into train_proper.csv and val_proper.csv.

Splitting is done at the **patient level** so no patient appears in both
train and validation — this prevents any data leakage.

Default: 95 % train / 5 % validation (~8 k images for reliable early stopping).

Usage (from repo root):
    uv run python scripts/create_val_split.py
"""

import argparse
import re

import pandas as pd
from sklearn.model_selection import train_test_split


def extract_patient_id(path: str) -> str:
    """Return 'patientXXXXX' from a CheXpert CSV path string."""
    match = re.search(r"patient\d+", path)
    return match.group(0) if match else path


def main(args: argparse.Namespace) -> None:
    df = pd.read_csv(args.input)
    print(f"Loaded {len(df):,} rows from {args.input}")

    df["_patient_id"] = df["Path"].apply(extract_patient_id)
    patients = df["_patient_id"].unique()
    print(f"Unique patients: {len(patients):,}")

    train_patients, val_patients = train_test_split(
        patients,
        test_size=args.val_frac,
        random_state=42,
    )

    train_df = df[df["_patient_id"].isin(train_patients)].drop(columns=["_patient_id"])
    val_df = df[df["_patient_id"].isin(val_patients)].drop(columns=["_patient_id"])

    train_df.to_csv(args.train_out, index=False)
    val_df.to_csv(args.val_out, index=False)

    print(f"train_proper: {len(train_df):,} rows  →  {args.train_out}")
    print(f"val_proper:   {len(val_df):,} rows  →  {args.val_out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Patient-level train/val split from train_split.csv"
    )
    parser.add_argument(
        "--input",
        default="CheXpert-v1.0-small/train_split.csv",
        help="Source CSV (default: CheXpert-v1.0-small/train_split.csv)",
    )
    parser.add_argument(
        "--train-out",
        default="CheXpert-v1.0-small/train_proper.csv",
        help="Output path for training split",
    )
    parser.add_argument(
        "--val-out",
        default="CheXpert-v1.0-small/val_proper.csv",
        help="Output path for validation split",
    )
    parser.add_argument(
        "--val-frac",
        type=float,
        default=0.05,
        help="Fraction of patients to use for validation (default: 0.05)",
    )
    main(parser.parse_args())
