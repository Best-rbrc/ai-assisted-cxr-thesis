#!/usr/bin/env python3
"""Split CheXpert train.csv into train_split.csv and test.csv.

Run this once. Then update train_config.yaml to point to train_split.csv
and use test.csv for final evaluation only.

Fixed random seed ensures the split is always identical.
"""

import argparse
from pathlib import Path

import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Split CheXpert train.csv into train/test"
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("CheXpert-v1.0-small/train.csv"),
    )
    parser.add_argument(
        "--train-out",
        type=Path,
        default=Path("CheXpert-v1.0-small/train_split.csv"),
    )
    parser.add_argument(
        "--test-out",
        type=Path,
        default=Path("CheXpert-v1.0-small/test.csv"),
    )
    parser.add_argument(
        "--test-frac",
        type=float,
        default=0.15,
        help="Fraction reserved for test set (default: 0.15 = 15%%)",
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    test_df = df.sample(frac=args.test_frac, random_state=args.seed)
    train_df = df.drop(test_df.index)

    train_df.to_csv(args.train_out, index=False)
    test_df.to_csv(args.test_out, index=False)

    total = len(df)
    print(f"Total rows:  {total:,}")
    print(f"Train split: {len(train_df):,} ({len(train_df)/total*100:.1f}%)  ->  {args.train_out}")
    print(f"Test split:  {len(test_df):,}  ({len(test_df)/total*100:.1f}%)   ->  {args.test_out}")
    print(f"\nDone. Update train_config.yaml:")
    print(f"  train_csv: \"{args.train_out}\"")
    print(f"  test_csv:  \"{args.test_out}\"")


if __name__ == "__main__":
    main()
