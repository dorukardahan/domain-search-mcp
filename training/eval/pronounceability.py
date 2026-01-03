#!/usr/bin/env python3
"""
Pronounceability Metrics for Domain Names

Measures how easy a domain name is to pronounce:
- Vowel/consonant ratio: Natural speech patterns
- Consonant clusters: Hard to pronounce sequences (e.g., "xkqz")
- Syllable structure: Does it follow natural syllable patterns?
- Known phoneme patterns: Common English sounds
"""

import re
from dataclasses import dataclass


VOWELS = set('aeiouy')
CONSONANTS = set('bcdfghjklmnpqrstvwxz')

# Common pronounceable patterns
GOOD_PATTERNS = [
    r'[aeiou]',           # Has vowels
    r'[bcdfghjklmnprstvwz][aeiou]',  # CV pattern
    r'[aeiou][bcdfghjklmnprstvwz]',  # VC pattern
    r'ing$', r'ify$', r'ly$', r'io$', r'ia$',  # Common endings
    r'^[bcdfghjklmnprstvw]',  # Starts with common consonant
]

# Bad patterns - hard to pronounce
BAD_PATTERNS = [
    r'[bcdfghjkmnpqstvwxz]{4,}',  # 4+ consonants in a row
    r'[aeiou]{3,}',               # 3+ vowels in a row
    r'[qxz]{2,}',                 # Multiple rare consonants
    r'^[xz]',                     # Starts with x or z
    r'[0-9]{3,}',                 # 3+ numbers in a row
    r'[bcdfghjklmnpqrstvwxz]$',   # Ends with consonant cluster
]


@dataclass
class PronounceabilityResult:
    """Result of pronounceability analysis."""
    vowel_ratio: float           # 0.0 - 1.0 (ideal: ~0.35-0.45)
    consonant_cluster_score: float  # 0.0 - 1.0 (1.0 = no bad clusters)
    pattern_score: float         # 0.0 - 1.0 (matches good patterns)
    length_score: float          # 0.0 - 1.0 (penalize very long names)
    overall: float               # Combined score

    def to_dict(self) -> dict:
        return {
            "vowel_ratio": self.vowel_ratio,
            "consonant_cluster_score": self.consonant_cluster_score,
            "pattern_score": self.pattern_score,
            "length_score": self.length_score,
            "overall": self.overall,
        }


def parse_domain_names(response: str) -> list[str]:
    """Extract domain names from response."""
    pattern = r'([a-z0-9-]+)\.[a-z]{2,10}\s*[—\-–]'
    return [match.group(1) for match in re.finditer(pattern, response.lower())]


def calculate_vowel_ratio(name: str) -> float:
    """
    Calculate vowel ratio and score it.
    Ideal ratio is around 0.35-0.45 for English-like words.
    """
    letters = [c for c in name.lower() if c.isalpha()]
    if not letters:
        return 0.0

    vowel_count = sum(1 for c in letters if c in VOWELS)
    ratio = vowel_count / len(letters)

    # Score based on how close to ideal range (0.35-0.45)
    if 0.30 <= ratio <= 0.50:
        return 1.0
    elif 0.20 <= ratio < 0.30 or 0.50 < ratio <= 0.60:
        return 0.7
    elif 0.10 <= ratio < 0.20 or 0.60 < ratio <= 0.70:
        return 0.4
    else:
        return 0.2


def calculate_consonant_cluster_score(name: str) -> float:
    """
    Check for hard-to-pronounce consonant clusters.
    Returns 1.0 if no bad clusters, lower for more clusters.
    """
    name = name.lower()

    # Count matches to bad patterns
    bad_count = 0
    for pattern in BAD_PATTERNS:
        matches = re.findall(pattern, name)
        bad_count += len(matches)

    # Score inversely based on bad patterns found
    if bad_count == 0:
        return 1.0
    elif bad_count == 1:
        return 0.7
    elif bad_count == 2:
        return 0.4
    else:
        return 0.2


def calculate_pattern_score(name: str) -> float:
    """
    Check if name matches good pronounceable patterns.
    """
    name = name.lower()

    good_count = 0
    for pattern in GOOD_PATTERNS:
        if re.search(pattern, name):
            good_count += 1

    # Normalize by number of patterns
    return min(good_count / 4, 1.0)  # 4 matches = perfect score


def calculate_length_score(name: str) -> float:
    """
    Score based on length.
    Ideal: 5-10 chars
    """
    length = len(name)

    if 5 <= length <= 10:
        return 1.0
    elif 4 <= length <= 12:
        return 0.8
    elif 3 <= length <= 15:
        return 0.6
    else:
        return 0.3


def check_pronounceability(name: str) -> PronounceabilityResult:
    """
    Analyze pronounceability of a single domain name.
    """
    # Remove numbers and hyphens for analysis
    alpha_name = re.sub(r'[^a-z]', '', name.lower())

    if not alpha_name:
        return PronounceabilityResult(0.0, 0.0, 0.0, 0.0, 0.0)

    vowel_ratio = calculate_vowel_ratio(alpha_name)
    cluster_score = calculate_consonant_cluster_score(alpha_name)
    pattern_score = calculate_pattern_score(alpha_name)
    length_score = calculate_length_score(name)

    # Weighted average (clusters are most important)
    overall = (
        vowel_ratio * 0.25 +
        cluster_score * 0.35 +
        pattern_score * 0.25 +
        length_score * 0.15
    )

    return PronounceabilityResult(
        vowel_ratio=round(vowel_ratio, 3),
        consonant_cluster_score=round(cluster_score, 3),
        pattern_score=round(pattern_score, 3),
        length_score=round(length_score, 3),
        overall=round(overall, 3),
    )


def check_pronounceability_response(response: str) -> PronounceabilityResult:
    """
    Analyze pronounceability of all domain names in a response.
    """
    names = parse_domain_names(response)

    if not names:
        return PronounceabilityResult(0.0, 0.0, 0.0, 0.0, 0.0)

    results = [check_pronounceability(name) for name in names]
    n = len(results)

    return PronounceabilityResult(
        vowel_ratio=round(sum(r.vowel_ratio for r in results) / n, 3),
        consonant_cluster_score=round(sum(r.consonant_cluster_score for r in results) / n, 3),
        pattern_score=round(sum(r.pattern_score for r in results) / n, 3),
        length_score=round(sum(r.length_score for r in results) / n, 3),
        overall=round(sum(r.overall for r in results) / n, 3),
    )


def evaluate_batch(samples: list[dict]) -> dict:
    """
    Evaluate pronounceability for a batch of samples.
    """
    results = []
    for sample in samples:
        result = check_pronounceability_response(sample['response'])
        results.append(result)

    n = len(results)
    if n == 0:
        return {"error": "No samples to evaluate"}

    return {
        "num_samples": n,
        "avg_vowel_ratio": round(sum(r.vowel_ratio for r in results) / n, 3),
        "avg_consonant_cluster_score": round(sum(r.consonant_cluster_score for r in results) / n, 3),
        "avg_pattern_score": round(sum(r.pattern_score for r in results) / n, 3),
        "avg_length_score": round(sum(r.length_score for r in results) / n, 3),
        "avg_overall": round(sum(r.overall for r in results) / n, 3),
    }


if __name__ == "__main__":
    # Test examples
    test_names = [
        "cofio",      # Good - short, pronounceable
        "sealatte",   # Good - has vowels, pattern
        "xkqzptm",    # Bad - consonant cluster
        "brewlo",     # Good
        "aaaaeeee",   # Bad - too many vowels
    ]

    print("Pronounceability Test:")
    for name in test_names:
        result = check_pronounceability(name)
        print(f"  {name}: {result.overall} (vowel: {result.vowel_ratio}, cluster: {result.consonant_cluster_score})")
