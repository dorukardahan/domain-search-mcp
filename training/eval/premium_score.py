#!/usr/bin/env python3
"""
Premium/Brandability Score for Domain Names

Measures how valuable and brandable a domain name is:
- Length score: Shorter is better (3-6 chars = premium)
- Dictionary word bonus: Real words are valuable
- TLD value: .com > .io > .co > others
- Pattern quality: Clean patterns score higher
- Memorability: Easy to remember and type
"""

import re
from dataclasses import dataclass

# Common English words that make good domain bases
VALUABLE_WORDS = {
    'get', 'try', 'go', 'my', 'the', 'app', 'hub', 'lab', 'box', 'kit',
    'pro', 'max', 'top', 'best', 'fast', 'easy', 'smart', 'super', 'mega',
    'cloud', 'data', 'code', 'dev', 'tech', 'web', 'net', 'link', 'sync',
    'flow', 'stream', 'wave', 'spark', 'bolt', 'flash', 'swift', 'quick',
    'zen', 'nova', 'pixel', 'byte', 'bit', 'node', 'mesh', 'grid', 'stack',
    'ai', 'ml', 'api', 'io', 'fx', 'hq', 'os', 'ux', 'ui',
}

# Valuable suffixes for tech/startup domains
VALUABLE_SUFFIXES = {
    'ly', 'ify', 'io', 'fy', 'er', 'fy', 'hub', 'lab', 'box', 'hq',
    'ai', 'app', 'dev', 'pro', 'max', 'ify', 'able', 'ful',
}

# TLD value rankings
TLD_VALUES = {
    'com': 1.0,
    'io': 0.9,
    'co': 0.85,
    'ai': 0.9,
    'app': 0.8,
    'dev': 0.8,
    'net': 0.7,
    'org': 0.65,
    'xyz': 0.5,
    'one': 0.6,
    'tech': 0.7,
}


@dataclass
class PremiumResult:
    """Result of premium/brandability analysis."""
    length_score: float          # 0.0 - 1.0 (shorter = higher)
    word_score: float            # 0.0 - 1.0 (contains valuable words)
    tld_score: float             # 0.0 - 1.0 (based on TLD value)
    pattern_score: float         # 0.0 - 1.0 (clean pattern)
    memorability_score: float    # 0.0 - 1.0 (easy to remember)
    overall: float               # Combined brandability score

    def to_dict(self) -> dict:
        return {
            "length_score": self.length_score,
            "word_score": self.word_score,
            "tld_score": self.tld_score,
            "pattern_score": self.pattern_score,
            "memorability_score": self.memorability_score,
            "overall": self.overall,
        }


def parse_domains(response: str) -> list[tuple[str, str]]:
    """Extract (name, tld) pairs from response."""
    pattern = r'([a-z0-9-]+)\.([a-z]{2,10})\s*[—\-–]'
    return [(m.group(1), m.group(2)) for m in re.finditer(pattern, response.lower())]


def calculate_length_score(name: str) -> float:
    """
    Score based on length. Premium domains are short.
    3-4 chars = 1.0, 5-6 = 0.9, 7-8 = 0.7, 9-10 = 0.5, 11+ = 0.3
    """
    length = len(name)

    if length <= 4:
        return 1.0
    elif length <= 6:
        return 0.9
    elif length <= 8:
        return 0.7
    elif length <= 10:
        return 0.5
    elif length <= 12:
        return 0.4
    else:
        return 0.3


def calculate_word_score(name: str) -> float:
    """
    Score based on containing valuable words/patterns.
    """
    name_lower = name.lower()
    score = 0.5  # Base score

    # Check for valuable words
    for word in VALUABLE_WORDS:
        if word in name_lower:
            score += 0.2
            break

    # Check for valuable suffixes
    for suffix in VALUABLE_SUFFIXES:
        if name_lower.endswith(suffix):
            score += 0.15
            break

    # Bonus for being a single dictionary-like word
    if name_lower.isalpha() and len(name_lower) <= 8:
        score += 0.1

    return min(score, 1.0)


def calculate_tld_score(tld: str) -> float:
    """Score based on TLD value."""
    return TLD_VALUES.get(tld.lower(), 0.4)


def calculate_pattern_score(name: str) -> float:
    """
    Score based on pattern quality.
    Clean, simple patterns score higher.
    """
    name_lower = name.lower()
    score = 0.5

    # All letters (no numbers/hyphens) = bonus
    if name_lower.isalpha():
        score += 0.2

    # No consecutive same letters
    if not re.search(r'(.)\1{2,}', name_lower):
        score += 0.1

    # Starts with letter
    if name_lower[0].isalpha():
        score += 0.1

    # No hyphens
    if '-' not in name_lower:
        score += 0.1

    return min(score, 1.0)


def calculate_memorability_score(name: str) -> float:
    """
    Score how memorable/typeable the name is.
    """
    name_lower = name.lower()
    score = 0.5

    # Short names are more memorable
    if len(name_lower) <= 7:
        score += 0.2

    # Common letter patterns
    if re.search(r'[aeiou]', name_lower):  # Has vowels
        score += 0.1

    # No unusual character sequences
    if not re.search(r'[xzq]{2,}', name_lower):
        score += 0.1

    # Easy to type (no numbers, common letters)
    easy_chars = set('abcdefghijklmnoprstuvwy')
    char_ease = sum(1 for c in name_lower if c in easy_chars) / len(name_lower)
    score += char_ease * 0.1

    return min(score, 1.0)


def check_premium(name: str, tld: str) -> PremiumResult:
    """
    Analyze premium/brandability score of a domain.
    """
    length_score = calculate_length_score(name)
    word_score = calculate_word_score(name)
    tld_score = calculate_tld_score(tld)
    pattern_score = calculate_pattern_score(name)
    memorability_score = calculate_memorability_score(name)

    # Weighted average
    overall = (
        length_score * 0.25 +
        word_score * 0.20 +
        tld_score * 0.20 +
        pattern_score * 0.15 +
        memorability_score * 0.20
    )

    return PremiumResult(
        length_score=round(length_score, 3),
        word_score=round(word_score, 3),
        tld_score=round(tld_score, 3),
        pattern_score=round(pattern_score, 3),
        memorability_score=round(memorability_score, 3),
        overall=round(overall, 3),
    )


def check_premium_response(response: str) -> PremiumResult:
    """
    Analyze premium score for all domains in a response.
    """
    domains = parse_domains(response)

    if not domains:
        return PremiumResult(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    results = [check_premium(name, tld) for name, tld in domains]
    n = len(results)

    return PremiumResult(
        length_score=round(sum(r.length_score for r in results) / n, 3),
        word_score=round(sum(r.word_score for r in results) / n, 3),
        tld_score=round(sum(r.tld_score for r in results) / n, 3),
        pattern_score=round(sum(r.pattern_score for r in results) / n, 3),
        memorability_score=round(sum(r.memorability_score for r in results) / n, 3),
        overall=round(sum(r.overall for r in results) / n, 3),
    )


def evaluate_batch(samples: list[dict]) -> dict:
    """
    Evaluate premium score for a batch of samples.
    """
    results = []
    for sample in samples:
        result = check_premium_response(sample['response'])
        results.append(result)

    n = len(results)
    if n == 0:
        return {"error": "No samples to evaluate"}

    return {
        "num_samples": n,
        "avg_length_score": round(sum(r.length_score for r in results) / n, 3),
        "avg_word_score": round(sum(r.word_score for r in results) / n, 3),
        "avg_tld_score": round(sum(r.tld_score for r in results) / n, 3),
        "avg_pattern_score": round(sum(r.pattern_score for r in results) / n, 3),
        "avg_memorability_score": round(sum(r.memorability_score for r in results) / n, 3),
        "avg_overall": round(sum(r.overall for r in results) / n, 3),
    }


if __name__ == "__main__":
    # Test examples
    test_domains = [
        ("cofio", "com"),       # Short, .com = premium
        ("getapp", "io"),       # Has valuable word
        ("superlongdomainname", "xyz"),  # Long, weak TLD
        ("ai", "com"),          # Ultra short
        ("brewly", "io"),       # Good suffix
    ]

    print("Premium/Brandability Test:")
    for name, tld in test_domains:
        result = check_premium(name, tld)
        print(f"  {name}.{tld}: {result.overall} (length: {result.length_score}, word: {result.word_score})")
