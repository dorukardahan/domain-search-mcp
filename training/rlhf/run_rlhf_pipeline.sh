#!/bin/bash
# RLHF Pipeline for Domain Name Model
# Based on @alicankiraz0's hybrid judge approach
#
# Prerequisites:
#   - OPENROUTER_API_KEY set in environment
#   - Fine-tuned model at output-full/
#   - Test data at data/test.jsonl
#
# Cost estimate:
#   - Judge API calls: ~$5-10 for 500 prompts
#   - RunPod GPU for response generation: ~$10-20
#   - RunPod GPU for DPO training: ~$10-20
#   - Total: ~$25-50

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration
NUM_PROMPTS=${NUM_PROMPTS:-500}
RESPONSES_PER_PROMPT=${RESPONSES_PER_PROMPT:-4}
MODEL_PATH="${MODEL_PATH:-$TRAINING_DIR/output-full}"
TEST_FILE="${TEST_FILE:-$TRAINING_DIR/data/test.jsonl}"
OUTPUT_DIR="${OUTPUT_DIR:-$TRAINING_DIR/output-dpo}"

echo "============================================"
echo "RLHF Pipeline for Domain Name Model"
echo "============================================"
echo ""
echo "Configuration:"
echo "  NUM_PROMPTS: $NUM_PROMPTS"
echo "  RESPONSES_PER_PROMPT: $RESPONSES_PER_PROMPT"
echo "  MODEL_PATH: $MODEL_PATH"
echo "  TEST_FILE: $TEST_FILE"
echo "  OUTPUT_DIR: $OUTPUT_DIR"
echo ""

# Check prerequisites
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "ERROR: OPENROUTER_API_KEY not set"
    echo "Get your key at: https://openrouter.ai/keys"
    exit 1
fi

if [ ! -d "$MODEL_PATH" ]; then
    echo "ERROR: Model not found at $MODEL_PATH"
    exit 1
fi

if [ ! -f "$TEST_FILE" ]; then
    echo "ERROR: Test file not found at $TEST_FILE"
    exit 1
fi

# Step 1: Generate model responses (requires GPU)
echo ""
echo "Step 1/3: Generating model responses..."
echo "  This requires GPU - run on RunPod if local GPU unavailable"
echo ""

RESPONSES_FILE="$SCRIPT_DIR/model_responses.jsonl"
if [ -f "$RESPONSES_FILE" ]; then
    echo "  Found existing responses at $RESPONSES_FILE"
    echo "  Delete this file to regenerate"
else
    echo "  Running generate_model_responses.py..."
    python "$SCRIPT_DIR/generate_model_responses.py" \
        --model_path "$MODEL_PATH" \
        --test_file "$TEST_FILE" \
        --output "$RESPONSES_FILE" \
        --num_prompts "$NUM_PROMPTS" \
        --responses_per_prompt "$RESPONSES_PER_PROMPT"
fi

# Step 2: Score with hybrid judges and create preference pairs
echo ""
echo "Step 2/3: Scoring with hybrid judges..."
echo "  Using MiniMax M2.1 + DeepSeek v3.2"
echo ""

PREFERENCES_FILE="$SCRIPT_DIR/preference_pairs.jsonl"
if [ -f "$PREFERENCES_FILE" ]; then
    echo "  Found existing preferences at $PREFERENCES_FILE"
    echo "  Delete this file to regenerate"
else
    python "$SCRIPT_DIR/generate_preferences.py" \
        --test_file "$TEST_FILE" \
        --output "$PREFERENCES_FILE" \
        --num_prompts "$NUM_PROMPTS" \
        --model_responses_file "$RESPONSES_FILE"
fi

# Step 3: DPO training (requires GPU)
echo ""
echo "Step 3/3: DPO training..."
echo "  This requires GPU - run on RunPod if local GPU unavailable"
echo ""

python "$SCRIPT_DIR/train_dpo.py" \
    --model_path "$MODEL_PATH" \
    --preferences "$PREFERENCES_FILE" \
    --output "$OUTPUT_DIR" \
    --epochs 1 \
    --batch_size 2 \
    --learning_rate 5e-6

echo ""
echo "============================================"
echo "RLHF Pipeline Complete!"
echo "============================================"
echo ""
echo "DPO model saved to: $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "  1. Run evaluation: python run_evaluation.py --model_path $OUTPUT_DIR"
echo "  2. Upload to HuggingFace: huggingface-cli upload"
echo ""
