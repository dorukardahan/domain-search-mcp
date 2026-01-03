#!/usr/bin/env python3
"""
Model Evaluation Script

Runs the fine-tuned model on test prompts and evaluates the outputs
using the eval framework. Compares against baseline.

Usage:
    # Local model
    python eval_model.py --model_path training/output --samples 100

    # Together.ai API
    python eval_model.py --together --model Qwen/Qwen2.5-72B-Instruct-Turbo --samples 100
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from eval.constraint_satisfaction import evaluate_batch as eval_constraints
from eval.diversity_metrics import evaluate_batch as eval_diversity, evaluate_cross_batch_diversity, parse_domain_names
from eval.pronounceability import evaluate_batch as eval_pronounceability
from eval.premium_score import evaluate_batch as eval_premium


def load_test_prompts(test_file: str, num_samples: int = 100) -> list[dict]:
    """Load test prompts from JSONL file."""
    prompts = []
    with open(test_file, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            if i >= num_samples:
                break
            data = json.loads(line)
            prompts.append({
                "prompt": data["prompt"],
                "expected": data["response"],  # Original response for reference
                "meta": data.get("meta", {}),
            })
    return prompts


def generate_with_local_model(model_path: str, prompts: list[dict], max_length: int = 512) -> list[dict]:
    """Generate responses using local fine-tuned model."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    print(f"Loading model from {model_path}...")

    tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )

    results = []
    for i, item in enumerate(prompts):
        if (i + 1) % 10 == 0:
            print(f"  Generating {i + 1}/{len(prompts)}...")

        messages = [{"role": "user", "content": item["prompt"]}]
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer([text], return_tensors="pt").to(model.device)

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_length,
                temperature=0.7,
                top_p=0.9,
                do_sample=True,
                pad_token_id=tokenizer.pad_token_id,
            )

        response = tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Extract assistant response
        if "<|im_start|>assistant" in response:
            response = response.split("<|im_start|>assistant")[-1].strip()
            if "<|im_end|>" in response:
                response = response.split("<|im_end|>")[0].strip()
        else:
            response = response[len(text):].strip()

        results.append({
            "prompt": item["prompt"],
            "response": response,
            "meta": item.get("meta", {}),
        })

    return results


def generate_with_together(model: str, prompts: list[dict], api_key: str = None) -> list[dict]:
    """Generate responses using Together.ai API."""
    import requests

    api_key = api_key or os.environ.get("TOGETHER_API_KEY")
    if not api_key:
        raise ValueError("TOGETHER_API_KEY not set")

    results = []
    for i, item in enumerate(prompts):
        if (i + 1) % 10 == 0:
            print(f"  Generating {i + 1}/{len(prompts)}...")

        response = requests.post(
            "https://api.together.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": item["prompt"]}],
                "temperature": 0.7,
                "max_tokens": 512,
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()

        results.append({
            "prompt": item["prompt"],
            "response": data["choices"][0]["message"]["content"],
            "meta": item.get("meta", {}),
        })

    return results


def evaluate_results(samples: list[dict], name: str) -> dict:
    """Run evaluation on generated samples."""
    print(f"\n{'='*60}")
    print(f"Evaluating: {name} ({len(samples)} samples)")
    print('='*60)

    results = {
        "name": name,
        "num_samples": len(samples),
        "timestamp": datetime.now().isoformat(),
    }

    # Run all evaluations
    print("\n[1/4] Constraint satisfaction...")
    constraint_results = eval_constraints(samples)
    results["constraints"] = constraint_results
    print(f"  Score: {constraint_results['avg_overall']:.3f}")

    print("\n[2/4] Diversity...")
    diversity_results = eval_diversity(samples)
    results["diversity"] = diversity_results
    print(f"  Score: {diversity_results['avg_overall']:.3f}")

    # Cross-batch diversity
    all_names = []
    for sample in samples:
        all_names.extend(parse_domain_names(sample['response']))
    cross_div = evaluate_cross_batch_diversity(all_names)
    results["cross_batch_diversity"] = {
        "total_names": cross_div["total_names"],
        "unique_names": cross_div["unique_names"],
        "unique_ratio": cross_div["unique_ratio"],
    }
    print(f"  Cross-batch unique: {cross_div['unique_ratio']:.3f}")

    print("\n[3/4] Pronounceability...")
    pronounce_results = eval_pronounceability(samples)
    results["pronounceability"] = pronounce_results
    print(f"  Score: {pronounce_results['avg_overall']:.3f}")

    print("\n[4/4] Brandability...")
    premium_results = eval_premium(samples)
    results["premium"] = premium_results
    print(f"  Score: {premium_results['avg_overall']:.3f}")

    # Combined score
    combined = (
        constraint_results['avg_overall'] * 0.30 +
        diversity_results['avg_overall'] * 0.20 +
        pronounce_results['avg_overall'] * 0.25 +
        premium_results['avg_overall'] * 0.25
    )
    results["combined_score"] = round(combined, 3)

    print(f"\n{'='*60}")
    print("SUMMARY")
    print('='*60)
    print(f"  Constraint Satisfaction: {constraint_results['avg_overall']:.3f}")
    print(f"  Diversity:               {diversity_results['avg_overall']:.3f}")
    print(f"  Pronounceability:        {pronounce_results['avg_overall']:.3f}")
    print(f"  Brandability:            {premium_results['avg_overall']:.3f}")
    print(f"  ---")
    print(f"  COMBINED SCORE:          {combined:.3f} ({combined*10:.1f}/10)")
    print('='*60)

    return results


def compare_with_baseline(results: dict, baseline_file: str):
    """Compare results with baseline."""
    if not os.path.exists(baseline_file):
        print(f"\nNo baseline found at {baseline_file}")
        return

    with open(baseline_file, 'r') as f:
        baseline = json.load(f)

    print(f"\n{'='*60}")
    print(f"COMPARISON: Baseline vs {results['name']}")
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
            v1 = baseline.get(category, {}).get(key, 0)
            v2 = results.get(category, {}).get(key, 0)
        else:
            v1 = baseline.get(key, 0)
            v2 = results.get(key, 0)

        diff = v2 - v1
        arrow = "↑" if diff > 0.001 else "↓" if diff < -0.001 else "="
        color = "\033[92m" if diff > 0.001 else "\033[91m" if diff < -0.001 else ""
        reset = "\033[0m" if color else ""
        print(f"  {name:25s}: {v1:.3f} → {color}{v2:.3f}{reset} ({arrow} {abs(diff):.3f})")

    print('='*60)


def main():
    parser = argparse.ArgumentParser(description="Evaluate model on test prompts")
    parser.add_argument("--model_path", help="Path to local fine-tuned model")
    parser.add_argument("--together", action="store_true", help="Use Together.ai API")
    parser.add_argument("--model", default="Qwen/Qwen2.5-72B-Instruct-Turbo", help="Together.ai model name")
    parser.add_argument("--test_file", default="data/test.jsonl", help="Test prompts file")
    parser.add_argument("--samples", type=int, default=100, help="Number of samples to evaluate")
    parser.add_argument("--output", help="Output file for results")
    parser.add_argument("--baseline", default="results/baseline_dataset_quality.json", help="Baseline results file")

    args = parser.parse_args()

    # Load test prompts
    print(f"Loading {args.samples} test prompts from {args.test_file}...")
    prompts = load_test_prompts(args.test_file, args.samples)
    print(f"Loaded {len(prompts)} prompts")

    # Generate responses
    if args.together:
        print(f"\nGenerating with Together.ai ({args.model})...")
        samples = generate_with_together(args.model, prompts)
        model_name = args.model.replace("/", "_")
    elif args.model_path:
        print(f"\nGenerating with local model ({args.model_path})...")
        samples = generate_with_local_model(args.model_path, prompts)
        model_name = Path(args.model_path).name
    else:
        print("Error: Specify --model_path or --together")
        sys.exit(1)

    # Evaluate
    results = evaluate_results(samples, model_name)

    # Compare with baseline
    compare_with_baseline(results, args.baseline)

    # Save results
    output_file = args.output or f"results/{model_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {output_file}")


if __name__ == "__main__":
    main()
