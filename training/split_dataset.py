#!/usr/bin/env python3
"""
Dataset Splitter for Domain Name Training

Splits the 100k dataset into:
- train.jsonl (80k) - For training
- val.jsonl (10k)   - For validation during training
- test.jsonl (10k)  - For final evaluation (never seen during training)
"""

import json
import random
from pathlib import Path

# Paths
DATA_DIR = Path(__file__).parent / "data"
SOURCE_FILE = Path(__file__).parent.parent / "data" / "domain-dataset-100k.jsonl"

# Split ratios
TRAIN_RATIO = 0.8   # 80k
VAL_RATIO = 0.1     # 10k
TEST_RATIO = 0.1    # 10k

# Random seed for reproducibility
SEED = 42


def load_dataset(path: Path) -> list[dict]:
    """Load JSONL dataset."""
    data = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                data.append(json.loads(line))
    return data


def save_dataset(data: list[dict], path: Path):
    """Save dataset as JSONL."""
    with open(path, 'w', encoding='utf-8') as f:
        for item in data:
            f.write(json.dumps(item, ensure_ascii=False) + '\n')
    print(f"Saved {len(data):,} samples to {path}")


def split_dataset():
    """Split dataset into train/val/test."""
    print(f"Loading dataset from {SOURCE_FILE}...")
    data = load_dataset(SOURCE_FILE)
    print(f"Loaded {len(data):,} samples")

    # Shuffle with seed for reproducibility
    random.seed(SEED)
    random.shuffle(data)

    # Calculate split indices
    total = len(data)
    train_end = int(total * TRAIN_RATIO)
    val_end = train_end + int(total * VAL_RATIO)

    # Split
    train_data = data[:train_end]
    val_data = data[train_end:val_end]
    test_data = data[val_end:]

    print(f"\nSplit sizes:")
    print(f"  Train: {len(train_data):,} ({len(train_data)/total*100:.1f}%)")
    print(f"  Val:   {len(val_data):,} ({len(val_data)/total*100:.1f}%)")
    print(f"  Test:  {len(test_data):,} ({len(test_data)/total*100:.1f}%)")

    # Ensure data directory exists
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Save splits
    save_dataset(train_data, DATA_DIR / "train.jsonl")
    save_dataset(val_data, DATA_DIR / "val.jsonl")
    save_dataset(test_data, DATA_DIR / "test.jsonl")

    print("\nDone! Dataset split complete.")
    print(f"Files saved to: {DATA_DIR}")


if __name__ == "__main__":
    split_dataset()
