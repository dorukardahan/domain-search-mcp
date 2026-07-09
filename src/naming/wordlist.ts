/**
 * Shared bundled-wordlist loaders. Wordlists ship in the package (data/):
 *
 * - commonWords(): data/common-words.json (~10k everyday-vocabulary frequency
 *   list) — consumed by distinctiveness scoring (frequency semantics).
 * - englishWords(): data/english-words.json (~50k broad real-word dictionary)
 *   — consumed by slop-filter's real-word waiver (covers formal/literary
 *   words like zenith/synergy/metaphor missing from the 10k list).
 *
 * Guarded reads: on any failure we warn and fall back to an empty set so
 * callers degrade gracefully (distinctiveness checks skip; slop waiver never
 * fires, i.e. affix penalties behave exactly as they did before this module
 * existed).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

function loadWordlist(filename: string): Set<string> {
  // dist/naming/ -> package root is two levels up (same pattern as utils/version.ts)
  const p = join(__dirname, '..', '..', 'data', filename);
  try {
    return new Set(JSON.parse(readFileSync(p, 'utf8')) as string[]);
  } catch (error) {
    logger.warn('Could not read bundled wordlist; naming checks degraded', {
      path: p,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Set();
  }
}

let COMMON: Set<string> | null = null;
export function commonWords(): Set<string> {
  if (!COMMON) COMMON = loadWordlist('common-words.json');
  return COMMON;
}

let ENGLISH: Set<string> | null = null;
export function englishWords(): Set<string> {
  if (!ENGLISH) ENGLISH = loadWordlist('english-words.json');
  return ENGLISH;
}
