#!/usr/bin/env python3
"""
Generate multiple domain name responses per prompt using fine-tuned model.
Runs on RunPod with GPU to generate diverse candidates.

Usage (on RunPod):
    python generate_model_responses.py \
        --model_path /workspace/training/output-full \
        --test_file /workspace/training/data/test.jsonl \
        --output /workspace/training/rlhf/model_responses.jsonl \
        --num_prompts 500
"""

import argparse
import json
from pathlib import Path
import torch
from tqdm import tqdm
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel


def load_model(model_path: str, base_model: str = "Qwen/Qwen2.5-7B-Instruct"):
    """Load fine-tuned model with LoRA adapter"""
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

    print(f"Loading LoRA adapter from: {model_path}")
    model = PeftModel.from_pretrained(model, model_path)
    model.set_adapter("default")
    return model, tokenizer


def generate_responses(model, tokenizer, prompt: str, num_responses: int = 4):
    """Generate multiple diverse responses for a prompt"""
    temperatures = [0.7, 0.9, 1.0, 1.1][:num_responses]
    responses = []

    messages = [{"role": "user", "content": prompt}]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    for temp in temperatures:
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=256,
                temperature=temp,
                top_p=0.95,
                do_sample=True,
                pad_token_id=tokenizer.pad_token_id,
            )
        full_output = tokenizer.decode(outputs[0], skip_special_tokens=True)
        response = full_output[len(text):].strip()
        responses.append(response)

    return responses


def load_test_prompts(test_file: str, num_prompts: int):
    """Load prompts from test JSONL file (supports both formats)"""
    prompts = []
    with open(test_file, "r") as f:
        for line in f:
            if len(prompts) >= num_prompts:
                break
            data = json.loads(line)
            # Format 1: {"prompt": ..., "response": ...}
            if "prompt" in data:
                prompts.append(data["prompt"])
            # Format 2: {"messages": [{"role": "user", "content": ...}, ...]}
            elif "messages" in data:
                for msg in data["messages"]:
                    if msg["role"] == "user":
                        prompts.append(msg["content"])
                        break
    return prompts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_path", required=True)
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-7B-Instruct")
    parser.add_argument("--test_file", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--num_prompts", type=int, default=500)
    parser.add_argument("--responses_per_prompt", type=int, default=4)
    args = parser.parse_args()

    model, tokenizer = load_model(args.model_path, args.base_model)

    print(f"Loading prompts from {args.test_file}...")
    prompts = load_test_prompts(args.test_file, args.num_prompts)
    print(f"  Loaded {len(prompts)} prompts")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    results = []
    for prompt in tqdm(prompts, desc="Generating responses"):
        responses = generate_responses(model, tokenizer, prompt, args.responses_per_prompt)
        results.append({"prompt": prompt, "responses": responses})

    with open(output_path, "w") as f:
        for item in results:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"Generated {len(results)} response sets -> {output_path}")


if __name__ == "__main__":
    main()
