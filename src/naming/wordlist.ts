/**
 * Shared bundled-wordlist loader. Wordlist ships in the package (data/) and is
 * consumed by both distinctiveness scoring and slop-filter's real-word waiver.
 * Guarded read: on any failure we warn and fall back to an empty set so
 * callers degrade gracefully (distinctiveness checks skip; slop waiver never
 * fires, i.e. affix penalties behave exactly as they did before this module
 * existed).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

let COMMON: Set<string> | null = null;

export function commonWords(): Set<string> {
  if (!COMMON) {
    // dist/naming/ -> package root is two levels up (same pattern as utils/version.ts)
    const p = join(__dirname, '..', '..', 'data', 'common-words.json');
    try {
      COMMON = new Set(JSON.parse(readFileSync(p, 'utf8')) as string[]);
    } catch (error) {
      logger.warn('Could not read bundled wordlist; naming checks degraded', {
        path: p,
        error: error instanceof Error ? error.message : String(error),
      });
      COMMON = new Set();
    }
  }
  return COMMON;
}
