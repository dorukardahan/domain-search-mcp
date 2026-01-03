#!/bin/bash
# RunPod Setup Script for CRFT Training
# Run this after connecting to a RunPod instance

set -e

echo "=============================================="
echo "CRFT Training Setup for Domain Name Generation"
echo "=============================================="

# Check GPU
echo ""
echo "[1/5] Checking GPU..."
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
echo ""

# Install dependencies
echo "[2/5] Installing Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet torch transformers accelerate peft bitsandbytes
pip install --quiet datasets sentencepiece trl wandb einops
pip install --quiet safetensors huggingface_hub
echo "Dependencies installed."

# Clone repo (if not already present)
echo ""
echo "[3/5] Setting up repository..."
if [ ! -d "/workspace/domain-search-mcp" ]; then
    cd /workspace
    git clone https://github.com/dorukardahan/domain-search-mcp.git
    echo "Repository cloned."
else
    cd /workspace/domain-search-mcp
    git pull
    echo "Repository updated."
fi

cd /workspace/domain-search-mcp

# Check dataset
echo ""
echo "[4/5] Checking dataset..."
if [ -f "training/data/train.jsonl" ]; then
    TRAIN_COUNT=$(wc -l < training/data/train.jsonl)
    echo "Training data found: $TRAIN_COUNT samples"
else
    echo "WARNING: training/data/train.jsonl not found!"
    echo "Upload it with: scp training/data/train.jsonl root@YOUR_POD:/workspace/domain-search-mcp/training/data/"
fi

if [ -f "training/data/val.jsonl" ]; then
    VAL_COUNT=$(wc -l < training/data/val.jsonl)
    echo "Validation data found: $VAL_COUNT samples"
fi

# HuggingFace login check
echo ""
echo "[5/5] Checking HuggingFace access..."
if python -c "from huggingface_hub import HfFolder; print(HfFolder.get_token())" 2>/dev/null | grep -q "hf_"; then
    echo "HuggingFace: Logged in"
else
    echo "HuggingFace: Not logged in"
    echo "Run: huggingface-cli login"
fi

echo ""
echo "=============================================="
echo "Setup complete!"
echo "=============================================="
echo ""
echo "Quick test (5 minutes, ~$0.50):"
echo "  python training/train_crft.py \\"
echo "    --model Qwen/Qwen2.5-7B-Instruct \\"
echo "    --data training/data/train.jsonl \\"
echo "    --val_data training/data/val.jsonl \\"
echo "    --output training/output-test \\"
echo "    --max_samples 500"
echo ""
echo "Full training (4-6 hours, ~$30-50):"
echo "  python training/train_crft.py \\"
echo "    --model Qwen/Qwen2.5-14B-Instruct \\"
echo "    --data training/data/train.jsonl \\"
echo "    --val_data training/data/val.jsonl \\"
echo "    --output training/output"
echo ""
echo "=============================================="
