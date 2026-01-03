#!/usr/bin/env python3
"""
Constraint Satisfaction Metrics

Measures how well generated domain names follow the constraints in the prompt:
- Length constraints (e.g., "Length 4-10")
- TLD constraints (e.g., "Use TLDs: .com, .io")
- Prefix/suffix constraints (e.g., "Must include 'nova'")
- Count constraints (e.g., "Generate 6 names")
"""

import re
from dataclasses import dataclass


@dataclass
class ConstraintResult:
    """Result of constraint satisfaction check."""
    length_satisfied: float      # 0.0 - 1.0
    tld_satisfied: float         # 0.0 - 1.0
    prefix_suffix_satisfied: float  # 0.0 - 1.0
    count_satisfied: float       # 0.0 - 1.0
    overall: float               # Average of all

    def to_dict(self) -> dict:
        return {
            "length_satisfied": self.length_satisfied,
            "tld_satisfied": self.tld_satisfied,
            "prefix_suffix_satisfied": self.prefix_suffix_satisfied,
            "count_satisfied": self.count_satisfied,
            "overall": self.overall,
        }


def parse_domains_from_response(response: str) -> list[tuple[str, str]]:
    """
    Parse domain names from model response.
    Returns list of (name, tld) tuples.

    Example response:
    "- slnovai.com — Compact brand feel with technical vibe"
    """
    domains = []

    # Pattern: domain.tld followed by space or dash
    pattern = r'([a-z0-9-]+)\.([a-z]{2,10})\s*[—\-–]'

    for match in re.finditer(pattern, response.lower()):
        name = match.group(1)
        tld = match.group(2)
        domains.append((name, tld))

    return domains


def extract_length_constraint(prompt: str) -> tuple[int, int] | None:
    """Extract length constraint from prompt (e.g., 'Length 4-10')."""
    match = re.search(r'length\s*(\d+)\s*-\s*(\d+)', prompt.lower())
    if match:
        return int(match.group(1)), int(match.group(2))
    return None


def extract_tld_constraint(prompt: str) -> list[str] | None:
    """Extract TLD constraint from prompt (e.g., 'Use TLDs: .com, .io')."""
    match = re.search(r'use tlds?:\s*([^.]*(?:\.[a-z]+[,\s]*)+)', prompt.lower())
    if match:
        tld_str = match.group(1)
        tlds = re.findall(r'\.([a-z]+)', tld_str)
        return tlds
    return None


def extract_count_constraint(prompt: str) -> int | None:
    """Extract count constraint from prompt (e.g., 'Generate 6 names')."""
    match = re.search(r'generate\s+(\d+)', prompt.lower())
    if match:
        return int(match.group(1))
    return None


def extract_prefix_suffix_constraint(prompt: str) -> tuple[str | None, str | None]:
    """Extract prefix/suffix constraint (e.g., 'Must include "nova"')."""
    prefix = None
    suffix = None

    # Must include
    match = re.search(r'must include\s*["\']([^"\']+)["\']', prompt.lower())
    if match:
        prefix = match.group(1)  # Could be prefix, suffix, or anywhere

    # Must start with
    match = re.search(r'must start with\s*["\']([^"\']+)["\']', prompt.lower())
    if match:
        prefix = match.group(1)

    # Must end with
    match = re.search(r'must end with\s*["\']([^"\']+)["\']', prompt.lower())
    if match:
        suffix = match.group(1)

    return prefix, suffix


def check_constraints(prompt: str, response: str) -> ConstraintResult:
    """
    Check how well the response satisfies prompt constraints.
    Returns scores from 0.0 (failed) to 1.0 (fully satisfied).
    """
    domains = parse_domains_from_response(response)

    if not domains:
        return ConstraintResult(0.0, 0.0, 0.0, 0.0, 0.0)

    # Length constraint
    length_constraint = extract_length_constraint(prompt)
    if length_constraint:
        min_len, max_len = length_constraint
        length_ok = sum(1 for name, _ in domains if min_len <= len(name) <= max_len)
        length_satisfied = length_ok / len(domains)
    else:
        length_satisfied = 1.0  # No constraint = satisfied

    # TLD constraint
    tld_constraint = extract_tld_constraint(prompt)
    if tld_constraint:
        tld_ok = sum(1 for _, tld in domains if tld in tld_constraint)
        tld_satisfied = tld_ok / len(domains)
    else:
        tld_satisfied = 1.0

    # Prefix/suffix constraint
    prefix, suffix = extract_prefix_suffix_constraint(prompt)
    if prefix or suffix:
        ps_ok = 0
        for name, _ in domains:
            if prefix and prefix in name:
                ps_ok += 1
            elif suffix and name.endswith(suffix):
                ps_ok += 1
            elif not prefix and not suffix:
                ps_ok += 1
        prefix_suffix_satisfied = ps_ok / len(domains) if prefix or suffix else 1.0
    else:
        prefix_suffix_satisfied = 1.0

    # Count constraint
    count_constraint = extract_count_constraint(prompt)
    if count_constraint:
        # Allow some flexibility: 80-120% of target count
        ratio = len(domains) / count_constraint
        if 0.8 <= ratio <= 1.2:
            count_satisfied = 1.0
        elif ratio < 0.8:
            count_satisfied = ratio / 0.8
        else:  # ratio > 1.2
            count_satisfied = 1.2 / ratio
    else:
        count_satisfied = 1.0

    overall = (length_satisfied + tld_satisfied + prefix_suffix_satisfied + count_satisfied) / 4

    return ConstraintResult(
        length_satisfied=round(length_satisfied, 3),
        tld_satisfied=round(tld_satisfied, 3),
        prefix_suffix_satisfied=round(prefix_suffix_satisfied, 3),
        count_satisfied=round(count_satisfied, 3),
        overall=round(overall, 3),
    )


def evaluate_batch(samples: list[dict]) -> dict:
    """
    Evaluate constraint satisfaction for a batch of samples.

    Each sample should have 'prompt' and 'response' keys.
    """
    results = []
    for sample in samples:
        result = check_constraints(sample['prompt'], sample['response'])
        results.append(result)

    # Aggregate
    n = len(results)
    if n == 0:
        return {"error": "No samples to evaluate"}

    return {
        "num_samples": n,
        "avg_length_satisfied": round(sum(r.length_satisfied for r in results) / n, 3),
        "avg_tld_satisfied": round(sum(r.tld_satisfied for r in results) / n, 3),
        "avg_prefix_suffix_satisfied": round(sum(r.prefix_suffix_satisfied for r in results) / n, 3),
        "avg_count_satisfied": round(sum(r.count_satisfied for r in results) / n, 3),
        "avg_overall": round(sum(r.overall for r in results) / n, 3),
    }


if __name__ == "__main__":
    # Test with example
    test_prompt = 'Generate 6 brandable domain names for a research assistant. Style: technical. Length 4-10. Constraints: Must include "nova". Use TLDs: .com, .one, .ai.'
    test_response = """- slnovai.com — Compact brand feel with technical vibe
- stnova.ai — Compact brand feel with technical vibe
- crnovaes.com — Evokes vector while staying technical
- kinova.one — Compact brand feel with technical vibe
- nenova.one — Short and technical, fits research assistant
- menovas.com — Compact brand feel with technical vibe"""

    result = check_constraints(test_prompt, test_response)
    print("Constraint Satisfaction Test:")
    print(f"  Length: {result.length_satisfied}")
    print(f"  TLD: {result.tld_satisfied}")
    print(f"  Prefix/Suffix: {result.prefix_suffix_satisfied}")
    print(f"  Count: {result.count_satisfied}")
    print(f"  Overall: {result.overall}")
