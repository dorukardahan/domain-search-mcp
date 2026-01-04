#!/usr/bin/env python3
"""
RLHF Preference Data Generation for Domain Name Model

Uses hybrid judge system (inspired by @alicankiraz0):
- MiniMax M2.1: Coding/agent quality judge
- GLM-4.7 / DeepSeek: General reasoning judge

Process:
1. Load test prompts
2. Generate N candidates per prompt using our fine-tuned model
3. Score each candidate with hybrid judges
4. Create preference pairs (chosen vs rejected)
5. Save as DPO training data

Usage:
    export OPENROUTER_API_KEY=your_key
    python generate_preferences.py --num_prompts 500 --candidates_per_prompt 4
"""

import argparse
import asyncio
import json
import os
import random
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional
import httpx
from tqdm import tqdm

# Judge model configurations
JUDGES = {
    "minimax": {
        "model": "minimax/minimax-m2.1",
        "weight": 0.5,  # 50% weight in final score
        "focus": "brandability, memorability, creativity"
    },
    "deepseek": {
        "model": "deepseek/deepseek-chat-v3-0324",  # DeepSeek v3.2
        "weight": 0.5,  # 50% weight
        "focus": "constraint satisfaction, pronounceability, uniqueness"
    }
}

JUDGE_PROMPT_TEMPLATE = """You are an expert domain name evaluator. Score this domain name suggestion on a scale of 1-10.

**Original Request:**
{prompt}

**Domain Suggestion:**
{domain}

**Evaluation Criteria (focus on {focus}):**
1. Brandability (1-10): Is it memorable and marketable?
2. Pronounceability (1-10): Is it easy to say and spell?
3. Constraint Satisfaction (1-10): Does it match the request (TLD, length, style)?
4. Creativity (1-10): Is it unique and clever?
5. Overall (1-10): Would you recommend this domain?

Respond with ONLY a JSON object:
{{"brandability": X, "pronounceability": X, "constraint": X, "creativity": X, "overall": X}}
"""


@dataclass
class DomainCandidate:
    """A single domain name candidate with scores"""
    domain: str
    scores: dict
    combined_score: float = 0.0


@dataclass
class PreferencePair:
    """A preference pair for DPO training"""
    prompt: str
    chosen: str
    rejected: str
    chosen_score: float
    rejected_score: float


async def call_judge(
    client: httpx.AsyncClient,
    judge_name: str,
    prompt: str,
    domain: str,
    api_key: str
) -> dict:
    """Call a judge model to score a domain suggestion"""
    judge_config = JUDGES[judge_name]

    eval_prompt = JUDGE_PROMPT_TEMPLATE.format(
        prompt=prompt,
        domain=domain,
        focus=judge_config["focus"]
    )

    try:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://domain-search-mcp.com",
                "X-Title": "Domain Name Evaluator",
            },
            json={
                "model": judge_config["model"],
                "messages": [{"role": "user", "content": eval_prompt}],
                "temperature": 0.1,
                "max_tokens": 200,
            },
            timeout=60.0  # Increased timeout for slower models
        )

        # Check for error responses
        if response.status_code != 200:
            error_text = response.text[:200] if response.text else "Empty response"
            print(f"  [!] {judge_name} HTTP {response.status_code}: {error_text}")
            return {"brandability": 5, "pronounceability": 5, "constraint": 5, "creativity": 5, "overall": 5}

        response_data = response.json()

        # Check for API-level errors
        if "error" in response_data:
            print(f"  [!] {judge_name} API error: {response_data['error']}")
            return {"brandability": 5, "pronounceability": 5, "constraint": 5, "creativity": 5, "overall": 5}

        content = response_data["choices"][0]["message"]["content"]

        # Parse JSON from response
        # Handle potential markdown code blocks
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        scores = json.loads(content.strip())
        return scores

    except json.JSONDecodeError as e:
        print(f"  [!] {judge_name} JSON parse error: {e}")
        return {"brandability": 5, "pronounceability": 5, "constraint": 5, "creativity": 5, "overall": 5}
    except httpx.TimeoutException:
        print(f"  [!] {judge_name} timeout after 60s")
        return {"brandability": 5, "pronounceability": 5, "constraint": 5, "creativity": 5, "overall": 5}
    except Exception as e:
        print(f"  [!] {judge_name} error: {type(e).__name__}: {e}")
        # Return neutral scores on error
        return {"brandability": 5, "pronounceability": 5, "constraint": 5, "creativity": 5, "overall": 5}


async def score_candidate(
    client: httpx.AsyncClient,
    prompt: str,
    domain: str,
    api_key: str,
    active_judges: dict = None
) -> DomainCandidate:
    """Score a domain candidate using hybrid judges"""

    if active_judges is None:
        active_judges = JUDGES

    # Call judges in parallel
    tasks = []
    judge_names = []
    for judge_name in active_judges.keys():
        tasks.append(call_judge(client, judge_name, prompt, domain, api_key))
        judge_names.append(judge_name)

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Combine scores with weights
    combined_scores = {}
    total_weight = 0

    for judge_name, result in zip(judge_names, results):
        if isinstance(result, Exception):
            continue

        weight = active_judges[judge_name]["weight"]
        total_weight += weight

        for key, value in result.items():
            if key not in combined_scores:
                combined_scores[key] = 0
            combined_scores[key] += value * weight

    if total_weight > 0:
        for key in combined_scores:
            combined_scores[key] /= total_weight

    # Calculate final score (weighted average of all criteria)
    final_score = (
        combined_scores.get("brandability", 5) * 0.25 +
        combined_scores.get("pronounceability", 5) * 0.20 +
        combined_scores.get("constraint", 5) * 0.25 +
        combined_scores.get("creativity", 5) * 0.15 +
        combined_scores.get("overall", 5) * 0.15
    )

    return DomainCandidate(
        domain=domain,
        scores=combined_scores,
        combined_score=final_score
    )


def extract_domains_from_response(response: str) -> list[str]:
    """Extract domain names from model response"""
    domains = []
    lines = response.strip().split("\n")

    for line in lines:
        line = line.strip()
        # Skip empty lines and headers
        if not line or line.startswith("#") or line.startswith("Here"):
            continue

        # Remove numbering (1. 2. - etc.)
        if line[0].isdigit() and "." in line[:3]:
            line = line.split(".", 1)[1].strip()
        if line.startswith("-"):
            line = line[1:].strip()

        # Extract just the domain part (remove descriptions)
        if " - " in line:
            line = line.split(" - ")[0].strip()
        if " (" in line:
            line = line.split(" (")[0].strip()

        # Clean up
        domain = line.strip("*").strip("`").strip()

        # Validate it looks like a domain
        if domain and "." in domain and len(domain) < 50:
            domains.append(domain)

    return domains[:10]  # Max 10 per response


async def generate_candidates_local(
    prompt: str,
    model_path: str,
    num_candidates: int = 4
) -> list[str]:
    """
    Generate candidate domains using our fine-tuned model.
    For now, we'll use a simple approach - in production,
    this would call the actual model.
    """
    # TODO: Integrate with actual model inference
    # For now, return placeholder - this will be replaced
    # when we run on RunPod with the actual model
    return []


def load_test_prompts(test_file: str, num_prompts: int) -> list[dict]:
    """Load prompts from test JSONL file (supports both formats)"""
    prompts = []

    with open(test_file, "r") as f:
        for line in f:
            if len(prompts) >= num_prompts:
                break

            data = json.loads(line)
            # Format 1: {"prompt": ..., "response": ...}
            if "prompt" in data:
                prompts.append({
                    "prompt": data["prompt"],
                    "expected": data.get("response", "")
                })
            # Format 2: {"messages": [{"role": "user", "content": ...}, ...]}
            elif "messages" in data:
                for msg in data["messages"]:
                    if msg["role"] == "user":
                        prompts.append({
                            "prompt": msg["content"],
                            "expected": data["messages"][-1]["content"] if data["messages"][-1]["role"] == "assistant" else ""
                        })
                        break

    return prompts


def create_preference_pairs(candidates: list[DomainCandidate]) -> list[tuple]:
    """Create preference pairs from scored candidates"""
    pairs = []

    # Sort by score
    sorted_candidates = sorted(candidates, key=lambda x: x.combined_score, reverse=True)

    # Create pairs: best vs rest
    if len(sorted_candidates) >= 2:
        best = sorted_candidates[0]
        for other in sorted_candidates[1:]:
            # Only create pair if score difference is meaningful (> 0.5)
            if best.combined_score - other.combined_score > 0.5:
                pairs.append((best, other))

    return pairs


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test_file", default="data/test.jsonl")
    parser.add_argument("--output", default="rlhf/preference_pairs.jsonl")
    parser.add_argument("--num_prompts", type=int, default=500)
    parser.add_argument("--candidates_per_prompt", type=int, default=4)
    parser.add_argument("--model_responses_file", help="Pre-generated model responses JSONL")
    parser.add_argument("--judge", default="both", choices=["both", "minimax", "deepseek"],
                        help="Which judge to use")
    args = parser.parse_args()

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("Error: OPENROUTER_API_KEY not set")
        print("Get your key at: https://openrouter.ai/keys")
        return

    # Load pre-generated model responses if available (PRIORITY)
    model_responses = {}
    if args.model_responses_file and Path(args.model_responses_file).exists():
        print(f"Loading pre-generated responses from {args.model_responses_file}...")
        with open(args.model_responses_file, "r") as f:
            for line in f:
                data = json.loads(line)
                model_responses[data["prompt"]] = data["responses"]
        print(f"  Loaded {len(model_responses)} response sets")

    # Build prompts list - prioritize model_responses if available
    if model_responses:
        print(f"Using {min(args.num_prompts, len(model_responses))} prompts from model_responses...")
        prompts = []
        for prompt_text in list(model_responses.keys())[:args.num_prompts]:
            prompts.append({
                "prompt": prompt_text,
                "expected": "",
                "responses": model_responses[prompt_text]
            })
    else:
        # Fallback to test file
        print(f"Loading {args.num_prompts} prompts from {args.test_file}...")
        prompts = load_test_prompts(args.test_file, args.num_prompts)

    print(f"  Total prompts to process: {len(prompts)}")

    # Filter judges based on argument
    active_judges = dict(JUDGES)
    if args.judge != "both":
        active_judges = {args.judge: JUDGES[args.judge]}
    print(f"  Using judges: {list(active_judges.keys())}")

    # Process prompts
    all_pairs = []

    async with httpx.AsyncClient() as client:
        for item in tqdm(prompts, desc="Processing prompts"):
            prompt = item["prompt"]

            # Get candidate domains - use pre-loaded responses or expected
            if "responses" in item:
                candidates_text = item["responses"]
            elif prompt in model_responses:
                candidates_text = model_responses[prompt]
            elif item.get("expected"):
                candidates_text = [item["expected"]]
            else:
                continue

            # Extract domain names from responses
            all_domains = []
            for resp in candidates_text:
                domains = extract_domains_from_response(resp)
                all_domains.extend(domains)

            # Deduplicate and limit
            all_domains = list(set(all_domains))[:args.candidates_per_prompt * 2]

            if len(all_domains) < 2:
                continue

            # Score each candidate with hybrid judges
            scored_candidates = []
            for domain in all_domains:
                candidate = await score_candidate(client, prompt, domain, api_key, active_judges)
                scored_candidates.append(candidate)

                # Rate limiting - longer delay for rate limit issues
                await asyncio.sleep(1.0)

            # Create preference pairs
            pairs = create_preference_pairs(scored_candidates)

            for chosen, rejected in pairs:
                pair = PreferencePair(
                    prompt=prompt,
                    chosen=chosen.domain,
                    rejected=rejected.domain,
                    chosen_score=chosen.combined_score,
                    rejected_score=rejected.combined_score
                )
                all_pairs.append(asdict(pair))

    # Save results
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        for pair in all_pairs:
            f.write(json.dumps(pair) + "\n")

    print(f"\nGenerated {len(all_pairs)} preference pairs")
    print(f"Saved to: {output_path}")

    # Print sample
    if all_pairs:
        print("\nSample preference pair:")
        sample = random.choice(all_pairs)
        print(f"  Prompt: {sample['prompt'][:80]}...")
        print(f"  Chosen: {sample['chosen']} (score: {sample['chosen_score']:.2f})")
        print(f"  Rejected: {sample['rejected']} (score: {sample['rejected_score']:.2f})")


if __name__ == "__main__":
    asyncio.run(main())
