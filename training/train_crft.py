#!/usr/bin/env python3
"""
CRFT (Critical Representation Fine-Tuning) for Domain Name Generation

Based on research from @alicankiraz0 (January 2026):
- Only fine-tune 0.016% of parameters (reasoning-critical layers)
- Target: Middle attention layers (most important for creative generation)
- 16% improvement in reasoning with minimal parameter updates

Usage:
    python train_crft.py \
        --model Qwen/Qwen2.5-14B-Instruct \
        --data data/train.jsonl \
        --output output/qwen-domain-crft \
        --epochs 1

Cost: ~$30-50 on RunPod (RTX 4090 or A100)
Time: ~4-6 hours for 80k samples
"""

import argparse
import os
import json
from dataclasses import dataclass
from datetime import datetime

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from trl import SFTTrainer, SFTConfig


@dataclass
class CRFTConfig:
    """CRFT Training Configuration"""
    model: str
    data: str
    output: str
    val_data: str = None
    max_seq_len: int = 512
    batch_size: int = 4
    grad_accum: int = 8
    epochs: int = 1
    lr: float = 1e-5  # Conservative for creative tasks
    max_samples: int = -1
    lora_r: int = 8  # Lower rank for CRFT (vs 16 for standard LoRA)
    lora_alpha: int = 16
    save_steps: int = 500
    eval_steps: int = 500
    wandb_project: str = None


# CRFT targets only middle layers (reasoning-critical)
# For Qwen2.5-14B: layers 10-30 out of 40 total
CRFT_TARGET_LAYERS = list(range(10, 31))  # Middle 20 layers


def get_crft_target_modules(model_config) -> list[str]:
    """
    Get target modules for CRFT.
    Only targets attention in middle layers (reasoning-critical).
    """
    num_layers = getattr(model_config, 'num_hidden_layers', 40)

    # Calculate middle layers (40-60% of model)
    start_layer = int(num_layers * 0.25)
    end_layer = int(num_layers * 0.75)

    target_modules = []
    for layer_idx in range(start_layer, end_layer):
        # Only attention projections (not MLP)
        target_modules.extend([
            f"model.layers.{layer_idx}.self_attn.q_proj",
            f"model.layers.{layer_idx}.self_attn.k_proj",
            f"model.layers.{layer_idx}.self_attn.v_proj",
        ])

    return target_modules


def parse_args() -> CRFTConfig:
    parser = argparse.ArgumentParser(description="CRFT Training for Domain Names")
    parser.add_argument("--model", default="Qwen/Qwen2.5-14B-Instruct")
    parser.add_argument("--data", required=True, help="Training JSONL file")
    parser.add_argument("--val_data", help="Validation JSONL (optional)")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--max_seq_len", type=int, default=512)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--grad_accum", type=int, default=8)
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--max_samples", type=int, default=-1)
    parser.add_argument("--lora_r", type=int, default=8)
    parser.add_argument("--lora_alpha", type=int, default=16)
    parser.add_argument("--save_steps", type=int, default=500)
    parser.add_argument("--eval_steps", type=int, default=500)
    parser.add_argument("--wandb_project", type=str, default=None)

    args = parser.parse_args()
    return CRFTConfig(**vars(args))


def format_chat(example, tokenizer):
    """Format example as chat template."""
    messages = [
        {"role": "user", "content": example.get("prompt", "").strip()},
        {"role": "assistant", "content": example.get("response", "").strip()},
    ]
    return tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=False,
    )


def main():
    cfg = parse_args()
    os.makedirs(cfg.output, exist_ok=True)

    # Save config
    config_path = os.path.join(cfg.output, "training_config.json")
    with open(config_path, "w") as f:
        json.dump(vars(cfg), f, indent=2)

    print("=" * 70)
    print("CRFT Training - Domain Name Generation")
    print("=" * 70)
    print(f"Model:            {cfg.model}")
    print(f"Training data:    {cfg.data}")
    print(f"Validation data:  {cfg.val_data or 'None'}")
    print(f"Output:           {cfg.output}")
    print(f"LoRA rank:        {cfg.lora_r} (CRFT uses lower rank)")
    print(f"Target layers:    Middle 50% (reasoning-critical)")
    print(f"Effective batch:  {cfg.batch_size * cfg.grad_accum}")
    print(f"Learning rate:    {cfg.lr}")
    print(f"Epochs:           {cfg.epochs}")
    print("=" * 70)
    print()

    # 4-bit quantization config
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    print("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(cfg.model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print("Loading model (4-bit quantized)...")
    model = AutoModelForCausalLM.from_pretrained(
        cfg.model,
        quantization_config=bnb_config,
        device_map={"": 0},  # Explicit GPU 0 for single-GPU training
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    )

    # Get CRFT target modules (middle layers only)
    target_modules = get_crft_target_modules(model.config)
    print(f"CRFT targeting {len(target_modules)} modules in middle layers")

    # Prepare model for training
    model = prepare_model_for_kbit_training(model)

    # CRFT LoRA config - lower rank, targeted layers
    lora_config = LoraConfig(
        r=cfg.lora_r,
        lora_alpha=cfg.lora_alpha,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=target_modules,
    )

    # Apply LoRA
    model = get_peft_model(model, lora_config)

    # Print trainable parameters
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Trainable parameters: {trainable_params:,} / {total_params:,}")
    print(f"Percentage: {100 * trainable_params / total_params:.4f}%")
    print()

    # Load training data
    print("Loading training dataset...")
    train_dataset = load_dataset("json", data_files=cfg.data, split="train")

    if cfg.max_samples > 0 and cfg.max_samples < len(train_dataset):
        print(f"Limiting to {cfg.max_samples} samples")
        train_dataset = train_dataset.select(range(cfg.max_samples))

    print(f"Formatting {len(train_dataset)} training examples...")
    train_dataset = train_dataset.map(
        lambda ex: {"text": format_chat(ex, tokenizer)},
        remove_columns=train_dataset.column_names,
        num_proc=min(8, os.cpu_count() or 1),
    )

    # Load validation data if provided
    eval_dataset = None
    if cfg.val_data and os.path.exists(cfg.val_data):
        print(f"Loading validation dataset from {cfg.val_data}...")
        eval_dataset = load_dataset("json", data_files=cfg.val_data, split="train")
        # Use subset for faster eval
        if len(eval_dataset) > 1000:
            eval_dataset = eval_dataset.select(range(1000))
        eval_dataset = eval_dataset.map(
            lambda ex: {"text": format_chat(ex, tokenizer)},
            remove_columns=eval_dataset.column_names,
            num_proc=min(8, os.cpu_count() or 1),
        )
        print(f"Validation set: {len(eval_dataset)} examples")

    # Training arguments (TRL 0.26+ uses SFTConfig)
    training_args = SFTConfig(
        output_dir=cfg.output,
        per_device_train_batch_size=cfg.batch_size,
        gradient_accumulation_steps=cfg.grad_accum,
        num_train_epochs=cfg.epochs,
        learning_rate=cfg.lr,
        logging_steps=25,
        save_steps=cfg.save_steps,
        save_total_limit=2,
        eval_strategy="steps" if eval_dataset else "no",
        eval_steps=cfg.eval_steps if eval_dataset else None,
        bf16=True,
        optim="paged_adamw_8bit",
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        gradient_checkpointing=True,  # Memory optimization
        gradient_checkpointing_kwargs={"use_reentrant": False},
        report_to="wandb" if cfg.wandb_project else "none",
        run_name=f"domain-crft-{datetime.now().strftime('%Y%m%d_%H%M')}",
        # SFT-specific params (moved from SFTTrainer)
        max_length=cfg.max_seq_len,
        packing=False,  # Disable packing to avoid flash attention issues
        dataset_text_field="text",  # Column with formatted chat text
        remove_unused_columns=False,  # Keep all columns during processing
    )

    # Initialize WandB if configured
    if cfg.wandb_project:
        import wandb
        wandb.init(project=cfg.wandb_project, config=vars(cfg))

    # Create trainer (TRL 0.26+ API)
    trainer = SFTTrainer(
        model=model,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        args=training_args,
    )

    # Train
    print("\n" + "=" * 70)
    print("Starting CRFT training...")
    print("=" * 70)

    train_result = trainer.train()

    # Save
    print("\n" + "=" * 70)
    print("Training complete! Saving model...")
    print("=" * 70)

    trainer.save_model(cfg.output)
    tokenizer.save_pretrained(cfg.output)

    # Save training metrics
    metrics_path = os.path.join(cfg.output, "training_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump({
            "train_loss": train_result.training_loss,
            "train_runtime": train_result.metrics.get("train_runtime"),
            "train_samples_per_second": train_result.metrics.get("train_samples_per_second"),
            "trainable_params": trainable_params,
            "total_params": total_params,
            "trainable_percent": 100 * trainable_params / total_params,
        }, f, indent=2)

    print(f"\nModel saved to: {cfg.output}")
    print(f"Training metrics: {metrics_path}")
    print("\n" + "=" * 70)
    print("Next steps:")
    print(f"1. Test: python test_model.py --model_path {cfg.output}")
    print(f"2. Evaluate: python run_evaluation.py --model {cfg.output}")
    print("3. Upload to Together.ai or HuggingFace")
    print("=" * 70)


if __name__ == "__main__":
    main()
