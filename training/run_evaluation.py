#!/usr/bin/env python3
"""
Main Evaluation Runner for Domain Name Generation Models

Runs all evaluation metrics on a dataset and produces a comprehensive report.
Can be used to:
1. Evaluate the training dataset quality
2. Run baseline evaluation on stock models
3. Compare fine-tuned models against baseline

Usage:
  python run_evaluation.py --dataset test        # Evaluate test.jsonl
  python run_evaluation.py --dataset val         # Evaluate val.jsonl
  python run_evaluation.py --baseline            # Run baseline with Together.ai
  python run_evaluation.py --compare model1.json model2.json
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from eval.constraint_satisfaction import evaluate_batch as eval_constraints, check_constraints
from eval.diversity_metrics import evaluate_batch as eval_diversity, evaluate_cross_batch_diversity, parse_domain_names
from eval.pronounceability import evaluate_batch as eval_pronounceability
from eval.premium_score import evaluate_batch as eval_premium


DATA_DIR = Path(__file__).parent / "data"
RESULTS_DIR = Path(__file__).parent / "results"


def load_dataset(name: str) -> list[dict]:
    """Load a dataset by name (train, val, test) or full path."""
    if name in ['train', 'val', 'test']:
        path = DATA_DIR / f"{name}.jsonl"
    else:
        path = Path(name)

    if not path.exists():
        print(f"Error: Dataset not found at {path}")
        print("Run split_dataset.py first to create train/val/test splits.")
        sys.exit(1)

    data = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                data.append(json.loads(line))

    return data


def evaluate_dataset(samples: list[dict], name: str = "dataset") -> dict:
    """
    Run all evaluation metrics on a dataset.
    Returns comprehensive metrics.
    """
    print(f"\n{'='*60}")
    print(f"Evaluating: {name} ({len(samples):,} samples)")
    print('='*60)

    results = {
        "name": name,
        "num_samples": len(samples),
        "timestamp": datetime.now().isoformat(),
    }

    # 1. Constraint Satisfaction
    print("\n[1/4] Evaluating constraint satisfaction...")
    constraint_results = eval_constraints(samples)
    results["constraints"] = constraint_results
    print(f"  Overall: {constraint_results['avg_overall']:.3f}")

    # 2. Diversity Metrics
    print("\n[2/4] Evaluating diversity...")
    diversity_results = eval_diversity(samples)
    results["diversity"] = diversity_results
    print(f"  Overall: {diversity_results['avg_overall']:.3f}")

    # Cross-batch diversity (check for repetitive patterns across all samples)
    all_names = []
    for sample in samples:
        all_names.extend(parse_domain_names(sample['response']))
    cross_diversity = evaluate_cross_batch_diversity(all_names)
    results["cross_batch_diversity"] = {
        "total_names": cross_diversity["total_names"],
        "unique_names": cross_diversity["unique_names"],
        "unique_ratio": cross_diversity["unique_ratio"],
    }
    print(f"  Cross-batch unique ratio: {cross_diversity['unique_ratio']:.3f}")

    # 3. Pronounceability
    print("\n[3/4] Evaluating pronounceability...")
    pronounce_results = eval_pronounceability(samples)
    results["pronounceability"] = pronounce_results
    print(f"  Overall: {pronounce_results['avg_overall']:.3f}")

    # 4. Premium/Brandability Score
    print("\n[4/4] Evaluating brandability...")
    premium_results = eval_premium(samples)
    results["premium"] = premium_results
    print(f"  Overall: {premium_results['avg_overall']:.3f}")

    # Calculate combined score
    combined_score = (
        constraint_results['avg_overall'] * 0.30 +  # Most important: follow instructions
        diversity_results['avg_overall'] * 0.20 +   # Variety matters
        pronounce_results['avg_overall'] * 0.25 +   # Must be speakable
        premium_results['avg_overall'] * 0.25       # Brandability
    )
    results["combined_score"] = round(combined_score, 3)

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print('='*60)
    print(f"  Constraint Satisfaction: {constraint_results['avg_overall']:.3f}")
    print(f"  Diversity:               {diversity_results['avg_overall']:.3f}")
    print(f"  Pronounceability:        {pronounce_results['avg_overall']:.3f}")
    print(f"  Brandability:            {premium_results['avg_overall']:.3f}")
    print(f"  ---")
    print(f"  COMBINED SCORE:          {combined_score:.3f} / 1.000")
    print(f"  (Equivalent:             {combined_score * 10:.1f} / 10)")
    print('='*60)

    return results


def save_results(results: dict, filename: str):
    """Save results to JSON file."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    path = RESULTS_DIR / filename
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nResults saved to: {path}")


def compare_results(file1: str, file2: str):
    """Compare two evaluation results."""
    with open(file1, 'r') as f:
        r1 = json.load(f)
    with open(file2, 'r') as f:
        r2 = json.load(f)

    print(f"\n{'='*60}")
    print(f"COMPARISON: {r1['name']} vs {r2['name']}")
    print('='*60)

    metrics = [
        ("Constraint Satisfaction", "constraints", "avg_overall"),
        ("Diversity", "diversity", "avg_overall"),
        ("Pronounceability", "pronounceability", "avg_overall"),
        ("Brandability", "premium", "avg_overall"),
        ("Combined Score", None, "combined_score"),
    ]

    for name, category, key in metrics:
        if category:
            v1 = r1[category][key]
            v2 = r2[category][key]
        else:
            v1 = r1[key]
            v2 = r2[key]

        diff = v2 - v1
        arrow = "↑" if diff > 0 else "↓" if diff < 0 else "="
        print(f"  {name:25s}: {v1:.3f} → {v2:.3f} ({arrow} {abs(diff):.3f})")

    print('='*60)


def main():
    parser = argparse.ArgumentParser(description="Evaluate domain name generation models")
    parser.add_argument("--dataset", choices=["train", "val", "test"],
                        help="Dataset to evaluate")
    parser.add_argument("--file", type=str,
                        help="Custom dataset file path")
    parser.add_argument("--output", type=str,
                        help="Output filename for results")
    parser.add_argument("--compare", nargs=2, metavar=("FILE1", "FILE2"),
                        help="Compare two result files")
    parser.add_argument("--sample", type=int, default=0,
                        help="Only evaluate N random samples (for quick testing)")

    args = parser.parse_args()

    if args.compare:
        compare_results(args.compare[0], args.compare[1])
        return

    # Load dataset
    if args.file:
        samples = load_dataset(args.file)
        name = Path(args.file).stem
    elif args.dataset:
        samples = load_dataset(args.dataset)
        name = args.dataset
    else:
        print("Error: Specify --dataset (train/val/test) or --file path")
        sys.exit(1)

    # Sample if requested
    if args.sample > 0 and args.sample < len(samples):
        import random
        random.seed(42)
        samples = random.sample(samples, args.sample)
        name = f"{name}_sample{args.sample}"

    # Evaluate
    results = evaluate_dataset(samples, name)

    # Save results
    output_name = args.output or f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    save_results(results, output_name)


if __name__ == "__main__":
    main()
