#!/usr/bin/env python3
"""
Quick DPO Model Evaluation Script
Compares SFT adapter vs DPO adapter using sample prompts.
"""

import argparse
import json
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel


def load_model_with_adapter(base_model: str, adapter_path: str):
    """Load base model with LoRA adapter."""
    print(f"Loading base model: {base_model}")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )

    print(f"Loading adapter from: {adapter_path}")
    model = PeftModel.from_pretrained(model, adapter_path)

    return model, tokenizer


def generate_response(model, tokenizer, prompt: str, max_tokens: int = 256) -> str:
    """Generate a response for a single prompt."""
    messages = [{"role": "user", "content": prompt}]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
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

    return response


def evaluate_adapter(base_model: str, adapter_path: str, test_prompts: list, num_samples: int = 20):
    """Evaluate an adapter on test prompts."""
    model, tokenizer = load_model_with_adapter(base_model, adapter_path)

    results = []
    for i, prompt in enumerate(test_prompts[:num_samples]):
        if (i + 1) % 5 == 0:
            print(f"  Generated {i + 1}/{num_samples}")

        response = generate_response(model, tokenizer, prompt)
        results.append({
            "prompt": prompt,
            "response": response,
        })

    # Free memory
    del model
    torch.cuda.empty_cache()

    return results


def score_responses(responses: list) -> dict:
    """Simple scoring based on basic quality metrics."""
    scores = {
        "avg_length": 0,
        "has_domains": 0,
        "tld_variety": 0,
        "avg_domain_count": 0,
    }

    total = len(responses)
    all_tlds = set()

    for item in responses:
        response = item["response"]
        scores["avg_length"] += len(response)

        # Count domains (look for .com, .io, etc patterns)
        import re
        domains = re.findall(r'[\w-]+\.(?:com|io|dev|ai|app|tech|xyz|co|net|org)', response.lower())
        if domains:
            scores["has_domains"] += 1
            scores["avg_domain_count"] += len(domains)
            for d in domains:
                tld = d.split('.')[-1]
                all_tlds.add(tld)

    scores["avg_length"] /= total
    scores["has_domains"] = (scores["has_domains"] / total) * 100
    scores["avg_domain_count"] /= total
    scores["tld_variety"] = len(all_tlds)

    return scores


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-7B-Instruct")
    parser.add_argument("--sft_adapter", default="output-full")
    parser.add_argument("--dpo_adapter", default="output-dpo")
    parser.add_argument("--test_file", default="data/test.jsonl")
    parser.add_argument("--num_samples", type=int, default=20)
    args = parser.parse_args()

    # Load test prompts
    print(f"Loading test prompts from {args.test_file}...")
    prompts = []
    with open(args.test_file, "r") as f:
        for line in f:
            data = json.loads(line)
            prompts.append(data["prompt"])
    print(f"  Loaded {len(prompts)} prompts")

    print(f"\n{'='*60}")
    print("Evaluating SFT Model")
    print('='*60)
    sft_results = evaluate_adapter(args.base_model, args.sft_adapter, prompts, args.num_samples)
    sft_scores = score_responses(sft_results)

    print(f"\n{'='*60}")
    print("Evaluating DPO Model")
    print('='*60)
    dpo_results = evaluate_adapter(args.base_model, args.dpo_adapter, prompts, args.num_samples)
    dpo_scores = score_responses(dpo_results)

    print(f"\n{'='*60}")
    print("COMPARISON RESULTS")
    print('='*60)
    print(f"\n{'Metric':<25} {'SFT':>15} {'DPO':>15} {'Change':>12}")
    print("-" * 70)
    for key in sft_scores:
        sft_val = sft_scores[key]
        dpo_val = dpo_scores[key]
        if isinstance(sft_val, float):
            diff = dpo_val - sft_val
            sign = "+" if diff > 0 else ""
            print(f"{key:<25} {sft_val:>15.2f} {dpo_val:>15.2f} {sign}{diff:>11.2f}")
        else:
            diff = dpo_val - sft_val
            sign = "+" if diff > 0 else ""
            print(f"{key:<25} {sft_val:>15} {dpo_val:>15} {sign}{diff:>11}")

    # Sample outputs
    print(f"\n{'='*60}")
    print("SAMPLE OUTPUTS")
    print('='*60)
    for i in range(min(3, len(sft_results))):
        print(f"\nPrompt: {sft_results[i]['prompt'][:100]}...")
        print(f"SFT: {sft_results[i]['response'][:200]}")
        print(f"DPO: {dpo_results[i]['response'][:200]}")


if __name__ == "__main__":
    main()
