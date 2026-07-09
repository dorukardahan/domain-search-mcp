/**
 * Unit tests for the ai_health tool's "not configured" branch.
 *
 * With Qwen no longer defaulting on, this branch is reachable when
 * QWEN_INFERENCE_ENDPOINT is unset. It must name the real env var.
 *
 * dotenv is mocked and the relevant env vars are cleared so the tool runs
 * fully offline (no network health checks are issued).
 */

jest.mock('dotenv', () => ({ config: jest.fn() }));

const QWEN_ENV = 'QWEN_INFERENCE_ENDPOINT';
const TOGETHER_ENV = 'TOGETHER_API_KEY';

interface ServiceLike {
  name: string;
  configured: boolean;
  message?: string;
}

describe('executeAiHealth - Qwen not configured', () => {
  const originalQwen = process.env[QWEN_ENV];
  const originalTogether = process.env[TOGETHER_ENV];

  afterEach(() => {
    if (originalQwen === undefined) delete process.env[QWEN_ENV];
    else process.env[QWEN_ENV] = originalQwen;
    if (originalTogether === undefined) delete process.env[TOGETHER_ENV];
    else process.env[TOGETHER_ENV] = originalTogether;
    jest.resetModules();
  });

  it('reports Qwen not configured and names QWEN_INFERENCE_ENDPOINT', async () => {
    delete process.env[QWEN_ENV];
    delete process.env[TOGETHER_ENV];
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { executeAiHealth } = require('../../src/tools/ai_health');

    const result = await executeAiHealth({ verbose: false });
    const qwen = (result.services as ServiceLike[]).find((s) => s.name.includes('Qwen'));

    expect(qwen).toBeDefined();
    expect(qwen?.configured).toBe(false);
    expect(qwen?.message).toContain('QWEN_INFERENCE_ENDPOINT');
    expect(qwen?.message).not.toContain('QWEN_API_URL');
  });
});
