/**
 * Package invariants — permanent CI guards from the trust-patch retro.
 *
 * Two defect classes from this project's history become permanent guards here:
 *
 *  1. Pack-size ceiling (93MB near-miss). A 93MB untracked training dataset
 *     once nearly shipped inside the published npm tarball. This runs the
 *     real `npm pack --dry-run` (no tarball written) and asserts the result
 *     stays small and free of dataset files (.jsonl / training/*).
 *
 *  2. Zero-default-egress (dead-IP class). A hardcoded default inference
 *     endpoint once made every fresh install silently phone a dead/reassigned
 *     IP. This scrubs every opt-in env var family and asserts every
 *     network-calling feature defaults to disabled with no fallback target.
 *
 * dotenv is mocked (same pattern as tests/unit/config.test.ts) so a
 * developer's local .env file cannot pollute the scrubbed-env assertions.
 */

jest.mock('dotenv', () => ({ config: jest.fn() }));

import { execSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');

// npm pack --dry-run shells out to a real npm process; generous but bounded.
const PACK_EXEC_TIMEOUT_MS = 30_000;
const PACK_TEST_TIMEOUT_MS = PACK_EXEC_TIMEOUT_MS + 10_000;

const MAX_UNPACKED_BYTES = 3 * 1024 * 1024; // 3 MB ceiling (guards the 93MB near-miss class)

interface NpmPackFileEntry {
  path: string;
  size: number;
}

interface NpmPackResult {
  unpackedSize: number;
  files: NpmPackFileEntry[];
}

describe('npm pack invariants (93MB dataset near-miss guard)', () => {
  it(
    'keeps the published tarball small and free of training data / jsonl files',
    () => {
      const output = execSync('npm pack --dry-run --json', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: PACK_EXEC_TIMEOUT_MS,
        maxBuffer: 20 * 1024 * 1024,
      });

      const [result] = JSON.parse(output) as NpmPackResult[];
      const filePaths = result.files.map((f) => f.path);
      const jsonlFiles = filePaths.filter((p) => /\.jsonl$/.test(p));
      const trainingFiles = filePaths.filter((p) => /^training\//.test(p));

      // --dry-run never writes a tarball to disk; nothing to clean up here.
      expect(result.unpackedSize).toBeLessThan(MAX_UNPACKED_BYTES);
      expect(jsonlFiles).toEqual([]);
      expect(trainingFiles).toEqual([]);
    },
    PACK_TEST_TIMEOUT_MS,
  );
});

describe('loadConfig — zero-default-egress (scrubbed env)', () => {
  const SCRUBBED_PREFIXES = [
    'QWEN_',
    'PRICING_',
    'NEGATIVE_',
    'TOGETHER_',
    'PORKBUN_',
    'NAMECHEAP_',
  ];
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (SCRUBBED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        delete process.env[key];
      }
    }
    jest.resetModules();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
    jest.resetModules();
  });

  it('disables qwen inference, pricing API and negative cache with no opt-in vars present', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadConfig } = require('../../src/config');
    const cfg = loadConfig();

    expect(cfg.qwenInference?.enabled).toBe(false);
    expect(cfg.pricingApi?.enabled).toBe(false);
    expect(cfg.negativeCache?.enabled).toBe(false);
  });

  it('excludes qwen_inference and pricing_api from available sources', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAvailableSources } = require('../../src/config');
    const sources = getAvailableSources();

    expect(sources).not.toContain('qwen_inference');
    expect(sources).not.toContain('pricing_api');
  });
});
