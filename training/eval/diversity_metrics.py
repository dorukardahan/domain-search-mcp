#!/usr/bin/env python3
"""
Diversity Metrics for Domain Name Generation

Measures variety and uniqueness of generated domain names:
- Type-Token Ratio (TTR): Unique words / Total words
- Self-BLEU: Overlap between generated names (lower = more diverse)
- Duplicate detection: Same name appearing multiple times
- Character diversity: Variety of characters used
"""

import re
from collections import Counter
from dataclasses import dataclass


@dataclass
class DiversityResult:
    """Result of diversity analysis."""
    type_token_ratio: float      # 0.0 - 1.0 (higher = more diverse)
    duplicate_rate: float        # 0.0 - 1.0 (lower = better)
    char_diversity: float        # 0.0 - 1.0 (higher = more varied chars)
    prefix_diversity: float      # 0.0 - 1.0 (variety in starting patterns)
    suffix_diversity: float      # 0.0 - 1.0 (variety in ending patterns)
    overall: float               # Combined score

    def to_dict(self) -> dict:
        return {
            "type_token_ratio": self.type_token_ratio,
            "duplicate_rate": self.duplicate_rate,
            "char_diversity": self.char_diversity,
            "prefix_diversity": self.prefix_diversity,
            "suffix_diversity": self.suffix_diversity,
            "overall": self.overall,
        }


def parse_domain_names(response: str) -> list[str]:
    """Extract just the domain names (without TLD) from response."""
    pattern = r'([a-z0-9-]+)\.[a-z]{2,10}\s*[—\-–]'
    return [match.group(1) for match in re.finditer(pattern, response.lower())]


def calculate_ttr(names: list[str]) -> float:
    """
    Calculate Type-Token Ratio.
    Measures lexical diversity - unique patterns vs total.
    """
    if not names:
        return 0.0

    # Split names into character n-grams (3-grams)
    all_ngrams = []
    for name in names:
        ngrams = [name[i:i+3] for i in range(len(name) - 2)]
        all_ngrams.extend(ngrams)

    if not all_ngrams:
        return 1.0  # Single char names = unique by default

    unique = len(set(all_ngrams))
    total = len(all_ngrams)

    return unique / total


def calculate_duplicate_rate(names: list[str]) -> float:
    """Calculate rate of duplicate names."""
    if not names:
        return 0.0

    unique = len(set(names))
    total = len(names)

    duplicate_count = total - unique
    return duplicate_count / total


def calculate_char_diversity(names: list[str]) -> float:
    """
    Measure character diversity.
    Penalizes overuse of same characters.
    """
    if not names:
        return 0.0

    all_chars = ''.join(names)
    if not all_chars:
        return 0.0

    char_counts = Counter(all_chars)
    unique_chars = len(char_counts)

    # Ideal: all 26 letters + 10 digits used somewhat evenly
    # Score based on how many unique chars used
    max_possible = 36  # a-z + 0-9
    return min(unique_chars / max_possible, 1.0)


def calculate_prefix_diversity(names: list[str], prefix_len: int = 2) -> float:
    """Measure diversity of name beginnings."""
    if not names:
        return 0.0

    prefixes = [name[:prefix_len] for name in names if len(name) >= prefix_len]
    if not prefixes:
        return 0.0

    unique = len(set(prefixes))
    total = len(prefixes)

    return unique / total


def calculate_suffix_diversity(names: list[str], suffix_len: int = 2) -> float:
    """Measure diversity of name endings."""
    if not names:
        return 0.0

    suffixes = [name[-suffix_len:] for name in names if len(name) >= suffix_len]
    if not suffixes:
        return 0.0

    unique = len(set(suffixes))
    total = len(suffixes)

    return unique / total


def check_diversity(response: str) -> DiversityResult:
    """
    Analyze diversity of generated domain names in a response.
    """
    names = parse_domain_names(response)

    if not names:
        return DiversityResult(0.0, 1.0, 0.0, 0.0, 0.0, 0.0)

    ttr = calculate_ttr(names)
    dup_rate = calculate_duplicate_rate(names)
    char_div = calculate_char_diversity(names)
    prefix_div = calculate_prefix_diversity(names)
    suffix_div = calculate_suffix_diversity(names)

    # Overall score (dup_rate is inverted - lower is better)
    overall = (ttr + (1 - dup_rate) + char_div + prefix_div + suffix_div) / 5

    return DiversityResult(
        type_token_ratio=round(ttr, 3),
        duplicate_rate=round(dup_rate, 3),
        char_diversity=round(char_div, 3),
        prefix_diversity=round(prefix_div, 3),
        suffix_diversity=round(suffix_div, 3),
        overall=round(overall, 3),
    )


def evaluate_batch(samples: list[dict]) -> dict:
    """
    Evaluate diversity for a batch of samples.
    """
    results = []
    for sample in samples:
        result = check_diversity(sample['response'])
        results.append(result)

    n = len(results)
    if n == 0:
        return {"error": "No samples to evaluate"}

    return {
        "num_samples": n,
        "avg_type_token_ratio": round(sum(r.type_token_ratio for r in results) / n, 3),
        "avg_duplicate_rate": round(sum(r.duplicate_rate for r in results) / n, 3),
        "avg_char_diversity": round(sum(r.char_diversity for r in results) / n, 3),
        "avg_prefix_diversity": round(sum(r.prefix_diversity for r in results) / n, 3),
        "avg_suffix_diversity": round(sum(r.suffix_diversity for r in results) / n, 3),
        "avg_overall": round(sum(r.overall for r in results) / n, 3),
    }


def evaluate_cross_batch_diversity(all_names: list[str]) -> dict:
    """
    Evaluate diversity across ALL generated names (not per-sample).
    Useful for detecting if model always generates same patterns.
    """
    if not all_names:
        return {"error": "No names to evaluate"}

    # Most common names
    name_counts = Counter(all_names)
    most_common = name_counts.most_common(10)

    # Most common prefixes (3 chars)
    prefixes = [n[:3] for n in all_names if len(n) >= 3]
    prefix_counts = Counter(prefixes)
    most_common_prefixes = prefix_counts.most_common(10)

    # Most common suffixes (3 chars)
    suffixes = [n[-3:] for n in all_names if len(n) >= 3]
    suffix_counts = Counter(suffixes)
    most_common_suffixes = suffix_counts.most_common(10)

    return {
        "total_names": len(all_names),
        "unique_names": len(set(all_names)),
        "unique_ratio": round(len(set(all_names)) / len(all_names), 3),
        "most_common_names": most_common,
        "most_common_prefixes": most_common_prefixes,
        "most_common_suffixes": most_common_suffixes,
    }


if __name__ == "__main__":
    # Test with example
    test_response = """- slnovai.com — Compact brand feel with technical vibe
- stnova.ai — Compact brand feel with technical vibe
- crnovaes.com — Evokes vector while staying technical
- kinova.one — Compact brand feel with technical vibe
- nenova.one — Short and technical, fits research assistant
- menovas.com — Compact brand feel with technical vibe"""

    result = check_diversity(test_response)
    print("Diversity Metrics Test:")
    print(f"  Type-Token Ratio: {result.type_token_ratio}")
    print(f"  Duplicate Rate: {result.duplicate_rate}")
    print(f"  Char Diversity: {result.char_diversity}")
    print(f"  Prefix Diversity: {result.prefix_diversity}")
    print(f"  Suffix Diversity: {result.suffix_diversity}")
    print(f"  Overall: {result.overall}")
