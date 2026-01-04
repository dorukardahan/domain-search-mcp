#!/bin/bash
set -e

TRAINING_DIR="/Users/doruk/Desktop/domain_mcp/domain-search-mcp/training"
KEY_FILE="$TRAINING_DIR/.openrouter_key"
SSH_KEY="$HOME/.runpod/ssh/RunPod-Key-Go"
RUNPOD_HOST="root@82.221.170.242"
RUNPOD_PORT="45251"

echo "=== RLHF Automation Script ==="
echo "Started: $(date)"

# Step 2: Download responses from RunPod
echo ""
echo "=== Step 2: Downloading responses ==="
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$RUNPOD_PORT" \
  "$RUNPOD_HOST:/workspace/training/rlhf/model_responses.jsonl" \
  "$TRAINING_DIR/rlhf/model_responses.jsonl"
echo "Downloaded model_responses.jsonl"

# Step 3: Run scoring locally
echo ""
echo "=== Step 3: Running judge scoring locally ==="
cd "$TRAINING_DIR"
export OPENROUTER_API_KEY=$(cat "$KEY_FILE")

python3 rlhf/generate_preferences.py \
  --model_responses_file "rlhf/model_responses.jsonl" \
  --output "rlhf/preference_pairs.jsonl" \
  --num_prompts 100 \
  --judge both

echo "Scoring complete"

# Step 4: Upload preference pairs to RunPod
echo ""
echo "=== Step 4: Uploading preference pairs ==="
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$RUNPOD_PORT" \
  "$TRAINING_DIR/rlhf/preference_pairs.jsonl" \
  "$RUNPOD_HOST:/workspace/training/rlhf/preference_pairs.jsonl"
echo "Uploaded preference_pairs.jsonl"

# Step 5: Run DPO training on RunPod
echo ""
echo "=== Step 5: Starting DPO training on RunPod ==="
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$RUNPOD_PORT" "$RUNPOD_HOST" << 'SSHEOF'
cd /workspace/training
python3 rlhf/train_dpo.py \
  --base_model "Qwen/Qwen2.5-7B-Instruct" \
  --sft_adapter "output-full" \
  --preference_data "rlhf/preference_pairs.jsonl" \
  --output_dir "output-dpo" \
  --epochs 1
SSHEOF

echo ""
echo "=== All steps complete! ==="
echo "Finished: $(date)"
