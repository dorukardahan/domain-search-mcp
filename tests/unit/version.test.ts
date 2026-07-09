/**
 * Unit tests for the runtime version resolver (src/utils/version.ts).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getServerVersion, FALLBACK_VERSION } from '../../src/utils/version';
import { logger } from '../../src/utils/logger';

describe('getServerVersion', () => {
  it('matches the version field in package.json', () => {
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
    expect(getServerVersion()).toBe(pkg.version);
    // Regression guard: no longer the stale hardcoded '1.9.8' literal.
    expect(getServerVersion()).not.toBe('1.9.8');
  });

  it('returns the fallback version and warns when package.json is unreadable', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const result = getServerVersion('/definitely/not/here/package.json');
    expect(result).toBe(FALLBACK_VERSION);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns the fallback version when the version field is missing', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    // tsconfig.json is valid JSON but has no "version" field.
    const noVersionPath = join(__dirname, '..', '..', 'tsconfig.json');
    expect(getServerVersion(noVersionPath)).toBe(FALLBACK_VERSION);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
