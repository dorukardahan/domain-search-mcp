/** Mouthfeel scoring: syllables, clusters, balance, typo risk, length. */

export function countSyllables(name: string): number {
  const n = name.toLowerCase().replace(/[^a-z]/g, '');
  const groups = n.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;
  if (n.endsWith('e') && count > 1 && !/[aeiouy]e$/.test(n) && !/[bcdfghjklmnpqrstvwxz]le$/.test(n)) count -= 1; // silent e (but "-Cle" endings like fable/table keep their syllable)
  return Math.max(1, count);
}

const BAD_CLUSTERS = /[bcdfghjklmnpqrstvwxz]{4,}/; // 4+ consonants in a row
const AMBIGUOUS = [/rn/, /vv/, /cl/i, /[il1]{2,}/]; // rn~m, vv~w, cl~d, il1 soup

export function phonaestheticScore(name: string): { score: number; notes: string[] } {
  const n = name.toLowerCase().replace(/[^a-z]/g, '');
  const notes: string[] = [];
  let score = 100;

  const syl = countSyllables(n);
  if (syl > 4) { score -= (syl - 4) * 15; notes.push(`${syl} syllables - long for a brand`); }

  if (BAD_CLUSTERS.test(n)) { score -= 45; notes.push('hard consonant cluster'); }

  const vowelRatio = (n.match(/[aeiouy]/g)?.length ?? 0) / Math.max(1, n.length);
  if (vowelRatio < 0.2 || vowelRatio > 0.7) { score -= 25; notes.push('unbalanced vowel/consonant mix'); }

  if (n.length > 12) { score -= (n.length - 12) * 4; notes.push(`${n.length} chars - hard to type`); }
  if (n.length >= 4 && n.length <= 8) score += 5;

  if (AMBIGUOUS.some((re) => re.test(n))) { score -= 15; notes.push('typo/confusion-prone letter shapes'); }

  return { score: Math.max(0, Math.min(100, score)), notes };
}
