#!/usr/bin/env python

import argparse
import os
from dataclasses import dataclass

import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from trl import SFTTrainer


@dataclass
class TrainConfig:
    model: str
    data: str
    output: str
    max_seq_len: int
    batch_size: int
    grad_accum: int
    epochs: int
    lr: float
    max_samples: int = -1  # -1 means use all samples


def parse_args() -> TrainConfig:
    parser = argparse.ArgumentParser(description="QLoRA SFT for domain name generation.")
    parser.add_argument("--model", required=True, help="Model name or path (e.g., Qwen/Qwen2.5-7B-Instruct)")
    parser.add_argument("--data", required=True, help="Path to JSONL dataset")
    parser.add_argument("--output", required=True, help="Output directory for model and checkpoints")
    parser.add_argument("--max_seq_len", type=int, default=512, help="Maximum sequence length (default: 512)")
    parser.add_argument("--batch_size", type=int, default=8, help="Per-device batch size (default: 8)")
    parser.add_argument("--grad_accum", type=int, default=4, help="Gradient accumulation steps (default: 4)")
    parser.add_argument("--epochs", type=int, default=1, help="Number of training epochs (default: 1)")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate (default: 2e-4)")
    parser.add_argument("--max_samples", type=int, default=-1, help="Max samples to use (-1 for all, useful for quick testing)")
    args = parser.parse_args()

    return TrainConfig(
        model=args.model,
        data=args.data,
        output=args.output,
        max_seq_len=args.max_seq_len,
        batch_size=args.batch_size,
        grad_accum=args.grad_accum,
        epochs=args.epochs,
        lr=args.lr,
        max_samples=args.max_samples,
    )


def build_text(example, tokenizer):
    prompt = (example.get("prompt") or "").strip()
    response = (example.get("response") or "").strip()
    messages = [
        {"role": "user", "content": prompt},
        {"role": "assistant", "content": response},
    ]
    return tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=False,
    )


def main():
    cfg = parse_args()
    os.makedirs(cfg.output, exist_ok=True)

    print("=" * 60)
    print("Domain Name Generation - QLoRA Training")
    print("=" * 60)
    print(f"Model: {cfg.model}")
    print(f"Dataset: {cfg.data}")
    print(f"Output: {cfg.output}")
    print(f"Max seq length: {cfg.max_seq_len}")
    print(f"Batch size: {cfg.batch_size}")
    print(f"Gradient accumulation: {cfg.grad_accum}")
    print(f"Effective batch size: {cfg.batch_size * cfg.grad_accum}")
    print(f"Epochs: {cfg.epochs}")
    print(f"Learning rate: {cfg.lr}")
    print(f"Max samples: {'All' if cfg.max_samples == -1 else cfg.max_samples}")
    print("=" * 60)
    print("")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    tokenizer = AutoTokenizer.from_pretrained(cfg.model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        cfg.model,
        quantization_config=bnb_config,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )

    print("Loading dataset...")
    dataset = load_dataset("json", data_files=cfg.data, split="train")
    
    # Limit samples if requested (for quick testing)
    if cfg.max_samples > 0 and cfg.max_samples < len(dataset):
        print(f"Limiting dataset from {len(dataset)} to {cfg.max_samples} samples")
        dataset = dataset.select(range(cfg.max_samples))
    
    print(f"Processing {len(dataset)} examples...")
    dataset = dataset.map(
        lambda ex: {"text": build_text(ex, tokenizer)},
        remove_columns=dataset.column_names,
        num_proc=min(8, os.cpu_count() or 1),
    )
    print(f"Dataset ready: {len(dataset)} examples")

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
    )

    training_args = TrainingArguments(
        output_dir=cfg.output,
        per_device_train_batch_size=cfg.batch_size,
        gradient_accumulation_steps=cfg.grad_accum,
        num_train_epochs=cfg.epochs,
        learning_rate=cfg.lr,
        logging_steps=25,
        save_steps=500,
        save_total_limit=2,
        bf16=True,
        optim="paged_adamw_8bit",
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=cfg.max_seq_len,
        packing=True,
        peft_config=lora_config,
        args=training_args,
    )

    print("\nStarting training...")
    print("=" * 60)
    trainer.train()
    
    print("\n" + "=" * 60)
    print("Training completed! Saving model...")
    trainer.save_model(cfg.output)
    tokenizer.save_pretrained(cfg.output)
    
    print(f"\nModel saved to: {cfg.output}")
    print("=" * 60)
    print("\nNext steps:")
    print(f"1. Test the model: python training/test_model.py --model_path {cfg.output}")
    print(f"2. Download from vast.ai: scp -P PORT -r root@HOST.vast.ai:{os.path.abspath(cfg.output)} ./")
    print("3. Integrate with MCP server")
    print("=" * 60)


if __name__ == "__main__":
    main()
