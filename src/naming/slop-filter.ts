/**
 * Deterministic anti-slop scoring. Penalizes name shapes that saturate
 * AI-generated suggestions. Case-insensitive; operates on the bare name
 * (no TLD).
 */
const SLOP_PREFIXES = ['nex', 'nova', 'syn', 'aether', 'quant', 'zen', 'omni', 'meta', 'neo', 'apex', 'tech'];
const SLOP_SUFFIXES = ['ify', 'ly', 'flow', 'forge', 'hub', 'labs', 'verse', 'gen', 'ai', 'x'];
const SLOP_PAIR_BONUS = 25; // prefix AND suffix both hit => almost certainly slop

export function slopPenalty(name: string): { penalty: number; hits: string[] } {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hits: string[] = [];
  let penalty = 0;

  const prefix = SLOP_PREFIXES.find((p) => n.startsWith(p) && n.length > p.length + 1);
  if (prefix) { penalty += 35; hits.push(`overused prefix "${prefix}-"`); }

  const suffix = SLOP_SUFFIXES.find((s) => n.endsWith(s) && n.length > s.length + 2);
  if (suffix) { penalty += 35; hits.push(`overused suffix "-${suffix}"`); }

  if (prefix && suffix) { penalty += SLOP_PAIR_BONUS; hits.push('prefix+suffix slop pattern'); }

  if (/[0-9]/.test(n)) { penalty += 20; hits.push('digit substitution'); }
  if (/x[aeiou]?z|z[aeiou]?x/.test(n)) { penalty += 20; hits.push('forced x/z cluster'); }
  if (/(.)\1\1/.test(n)) { penalty += 15; hits.push('tripled letter'); }

  return { penalty: Math.min(100, penalty), hits };
}
