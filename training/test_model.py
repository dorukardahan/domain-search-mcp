#!/usr/bin/env python
"""
Test fine-tuned Qwen model for domain name generation.
"""

import argparse
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel


def test_model(model_path: str, prompt: str, max_length: int = 512):
    """Load and test the fine-tuned model."""

    print("=" * 60)
    print("Loading fine-tuned model...")
    print("=" * 60)
    print(f"Model path: {model_path}")
    print(f"Prompt: {prompt}")
    print("")

    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Load base model + LoRA adapters
    print("Loading model (this may take a minute)...")
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )

    # Prepare messages
    messages = [
        {"role": "user", "content": prompt}
    ]

    # Tokenize
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )

    inputs = tokenizer([text], return_tensors="pt").to(model.device)

    # Generate
    print("\nGenerating response...")
    print("-" * 60)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_length,
            temperature=0.7,
            top_p=0.9,
            do_sample=True,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )

    # Decode
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)

    # Extract assistant response (after the prompt)
    if "<|im_start|>assistant" in response:
        assistant_response = response.split("<|im_start|>assistant")[-1].strip()
        if "<|im_end|>" in assistant_response:
            assistant_response = assistant_response.split("<|im_end|>")[0].strip()
    else:
        # Fallback: remove the input prompt
        assistant_response = response[len(text):].strip()

    print(assistant_response)
    print("-" * 60)
    print("\n✓ Generation complete!")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Test fine-tuned domain generation model")
    parser.add_argument(
        "--model_path",
        required=True,
        help="Path to fine-tuned model directory",
    )
    parser.add_argument(
        "--prompt",
        default="Generate 5 brandable domain names for an AI code assistant product. Style: technical, modern. Length 6-12 characters. Use TLDs: .ai, .dev. Provide a short reason for each name.",
        help="Prompt for domain generation",
    )
    parser.add_argument(
        "--max_length",
        type=int,
        default=512,
        help="Maximum generation length",
    )

    args = parser.parse_args()

    test_model(args.model_path, args.prompt, args.max_length)


if __name__ == "__main__":
    main()
