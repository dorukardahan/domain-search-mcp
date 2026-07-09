/** Distance from everyday vocabulary. Wordlist ships in the package (data/). */
import { commonWords } from './wordlist.js';

function withinOneEdit(a: string, dict: Set<string>): string | null {
  // deletions + substitutions + insertions of length-neighbors; a is short (<20)
  for (const w of dict) {
    if (Math.abs(w.length - a.length) > 1) continue;
    if (editDistanceLeq1(a, w)) return w;
  }
  return null;
}

function editDistanceLeq1(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length === b.length) { i++; j++; }
    else if (a.length > b.length) { i++; }
    else { j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function distinctivenessScore(name: string): { score: number; notes: string[] } {
  const n = name.toLowerCase().replace(/[^a-z]/g, '');
  const notes: string[] = [];
  let score = 80;

  if (commonWords().has(n)) { score = 25; notes.push('an everyday English word'); }
  else {
    const shadow = withinOneEdit(n, commonWords());
    if (shadow) { score -= 35; notes.push(`close to common word "${shadow}"`); }
  }
  if (n.length <= 4) { score += 10; notes.push('short names carry rarity value'); }
  return { score: Math.max(0, Math.min(100, score)), notes };
}
