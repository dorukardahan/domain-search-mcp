# RLHF Pipeline - RunPod Setup Guide

## Prerequisites

1. **OpenRouter API Key**: https://openrouter.ai/keys
2. **RunPod Account**: With payment method configured
3. **Trained Model**: Already at `training/output-full/`

## Step 1: Create RunPod Pod

```bash
runpodctl create pod \
  --name "domain-rlhf" \
  --gpuType "NVIDIA GeForce RTX 4090" \
  --secureCloud \
  --imageName "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04" \
  --volumeSize 50 \
  --ports "22/tcp" \
  --startSSH
```

## Step 2: Upload Files to RunPod

```bash
# Get pod SSH info
runpodctl get pod

# Connect to pod (replace with your pod ID)
ssh -tt -o PubkeyAcceptedKeyTypes=+ssh-rsa \
  -i ~/.runpod/ssh/RunPod-Key-Go \
  [POD_ID]@ssh.runpod.io

# On RunPod: Create workspace
mkdir -p /workspace/training/rlhf
mkdir -p /workspace/training/data
```

From local machine, use rsync or scp:
```bash
# Upload trained model
rsync -avz -e "ssh -o PubkeyAcceptedKeyTypes=+ssh-rsa -i ~/.runpod/ssh/RunPod-Key-Go" \
  /Users/doruk/Desktop/domain_mcp/domain-search-mcp/training/output-full/ \
  [POD_ID]@ssh.runpod.io:/workspace/training/output-full/

# Upload RLHF scripts
rsync -avz -e "ssh -o PubkeyAcceptedKeyTypes=+ssh-rsa -i ~/.runpod/ssh/RunPod-Key-Go" \
  /Users/doruk/Desktop/domain_mcp/domain-search-mcp/training/rlhf/ \
  [POD_ID]@ssh.runpod.io:/workspace/training/rlhf/

# Upload test data
rsync -avz -e "ssh -o PubkeyAcceptedKeyTypes=+ssh-rsa -i ~/.runpod/ssh/RunPod-Key-Go" \
  /Users/doruk/Desktop/domain_mcp/domain-search-mcp/training/data/test.jsonl \
  [POD_ID]@ssh.runpod.io:/workspace/training/data/
```

## Step 3: Install Dependencies on RunPod

```bash
# SSH into pod
ssh -tt -o PubkeyAcceptedKeyTypes=+ssh-rsa \
  -i ~/.runpod/ssh/RunPod-Key-Go [POD_ID]@ssh.runpod.io

# Install Python packages
pip install transformers peft trl datasets httpx tqdm bitsandbytes accelerate

# Set API key
export OPENROUTER_API_KEY="sk-or-v1-..."

# Verify GPU
nvidia-smi
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

## Step 4: Run RLHF Pipeline

```bash
cd /workspace/training

# Make script executable
chmod +x rlhf/run_rlhf_pipeline.sh

# Run full pipeline
./rlhf/run_rlhf_pipeline.sh

# Or run steps individually:

# Step 1: Generate model responses (~30 min)
python rlhf/generate_model_responses.py \
  --model_path /workspace/training/output-full \
  --test_file /workspace/training/data/test.jsonl \
  --output /workspace/training/rlhf/model_responses.jsonl \
  --num_prompts 500

# Step 2: Score with judges (~1-2 hours, depends on rate limits)
python rlhf/generate_preferences.py \
  --test_file /workspace/training/data/test.jsonl \
  --output /workspace/training/rlhf/preference_pairs.jsonl \
  --num_prompts 500 \
  --model_responses_file /workspace/training/rlhf/model_responses.jsonl

# Step 3: DPO training (~30-60 min)
python rlhf/train_dpo.py \
  --model_path /workspace/training/output-full \
  --preferences /workspace/training/rlhf/preference_pairs.jsonl \
  --output /workspace/training/output-dpo
```

## Step 5: Download Results

```bash
# From local machine
rsync -avz -e "ssh -o PubkeyAcceptedKeyTypes=+ssh-rsa -i ~/.runpod/ssh/RunPod-Key-Go" \
  [POD_ID]@ssh.runpod.io:/workspace/training/output-dpo/ \
  /Users/doruk/Desktop/domain_mcp/domain-search-mcp/training/output-dpo/

# Also download preference pairs (useful for analysis)
rsync -avz -e "ssh -o PubkeyAcceptedKeyTypes=+ssh-rsa -i ~/.runpod/ssh/RunPod-Key-Go" \
  [POD_ID]@ssh.runpod.io:/workspace/training/rlhf/preference_pairs.jsonl \
  /Users/doruk/Desktop/domain_mcp/domain-search-mcp/training/rlhf/
```

## Step 6: Stop Pod (IMPORTANT!)

```bash
# List pods
runpodctl get pod

# Stop pod to avoid charges
runpodctl stop pod [POD_ID]

# Or remove completely
runpodctl remove pod [POD_ID]
```

## Cost Breakdown

| Component | Duration | Cost/hr | Total |
|-----------|----------|---------|-------|
| RTX 4090 (response gen) | ~0.5 hr | $0.59 | ~$0.30 |
| OpenRouter (judges) | - | ~$0.50/1M tokens | ~$5-10 |
| RTX 4090 (DPO train) | ~1 hr | $0.59 | ~$0.60 |
| **Total** | | | **~$6-11** |

*Note: Secure Cloud pricing. Community Cloud is cheaper (~$0.34/hr) but less reliable.*

## Troubleshooting

### CUDA Error
```bash
nvidia-smi -c 0  # Reset compute mode
```

### Out of Memory
Reduce batch_size in train_dpo.py:
```bash
python rlhf/train_dpo.py ... --batch_size 1
```

### OpenRouter Rate Limit
The script has built-in 0.5s delays. If still hitting limits, increase sleep time in generate_preferences.py.

## Expected Output

After successful run:
```
training/
├── output-full/          # Original SFT model
├── output-dpo/           # DPO-trained model (NEW)
└── rlhf/
    ├── model_responses.jsonl    # Generated responses
    └── preference_pairs.jsonl   # Scored preferences
```
