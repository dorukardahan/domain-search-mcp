/**
 * Runtime version resolver.
 *
 * Reads the package version from package.json at runtime instead of hardcoding
 * a literal that drifts out of sync with the published version. The path is
 * resolved relative to the compiled file so it works from dist/ and via npx.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';

/** Version returned when package.json cannot be read or parsed. */
export const FALLBACK_VERSION = '0.0.0';

/**
 * Default package.json location relative to this module.
 *
 * Compiled: dist/utils/version.js -> ../../package.json (package root).
 * Source (ts-jest): src/utils/version.ts -> ../../package.json (repo root).
 */
function defaultPackageJsonPath(): string {
  return join(__dirname, '..', '..', 'package.json');
}

/**
 * Read the server version from package.json.
 *
 * @param pkgPath - Path to package.json (defaults to the resolved package root).
 * @returns The `version` field, or {@link FALLBACK_VERSION} if unreadable.
 */
export function getServerVersion(pkgPath: string = defaultPackageJsonPath()): string {
  try {
    const raw = readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.length > 0) {
      return parsed.version;
    }
    throw new Error('package.json is missing a valid "version" field');
  } catch (error) {
    logger.warn('Could not read version from package.json; using fallback', {
      path: pkgPath,
      fallback: FALLBACK_VERSION,
      error: error instanceof Error ? error.message : String(error),
    });
    return FALLBACK_VERSION;
  }
}
