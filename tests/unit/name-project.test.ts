jest.mock('../../src/naming/clearance', () => ({
  clearName: jest.fn(async (name: string) => ({
    name, verdict: 'cleared', domains: [{ domain: `${name}.com`, available: true, price_first_year: 11 }], socials: [],
  })),
}));
import { executeNameProject } from '../../src/tools/name_project';

describe('name_project phase 1', () => {
  it('brief mode returns generation instructions embedding the brief and lanes', async () => {
    const r = await executeNameProject({ mode: 'brief', brief: 'an MCP naming engine', lanes: ['mythic'] });
    expect(r.phase).toBe(1);
    expect(r.instructions).toContain('an MCP naming engine');
    expect(r.instructions).toMatch(/30.*50|between 30 and 50/i);
    expect(r.lanes.map((l) => l.key)).toEqual(['mythic']);
  });
  it('auto mode instructs the client to analyze the workspace itself', async () => {
    const r = await executeNameProject({ mode: 'auto' });
    expect(r.phase).toBe(1);
    expect(r.instructions).toMatch(/README|package\.json|source tree/i);
  });
  it('rejects brief mode without a brief', async () => {
    await expect(executeNameProject({ mode: 'brief' } as never)).rejects.toThrow();
  });
});

describe('name_project phase 2', () => {
  it('scores, ranks, and clears submitted candidates', async () => {
    const r = await executeNameProject({
      mode: 'brief', brief: 'x', candidates: ['Nexify', 'Corda'],
      targets: { tlds: ['com'] },
    });
    expect(r.phase).toBe(2);
    expect(r.shortlist[0].name).toBe('Corda'); // ranked above slop
    expect(r.shortlist[0].clearance?.verdict).toBe('cleared');
    expect(r.shortlist[0].total).toBeGreaterThan(r.shortlist[1].total);
  });
  it('skips clearance when targets are empty (pure naming)', async () => {
    const r = await executeNameProject({ mode: 'brief', brief: 'x', candidates: ['Corda'] });
    expect(r.shortlist[0].clearance).toBeUndefined();
  });
  it('from_name mode treats the given name as the first candidate', async () => {
    const r = await executeNameProject({ mode: 'from_name', name: 'Corda', candidates: [], targets: { tlds: ['com', 'io'] } });
    expect(r.phase).toBe(2);
    expect(r.shortlist.map((s) => s.name)).toContain('Corda');
  });
  it('from_domain mode strips the tld and seeds the bare name', async () => {
    const r = await executeNameProject({ mode: 'from_domain', name: 'corda.io', candidates: [] });
    expect(r.phase).toBe(2);
    expect(r.shortlist.map((s) => s.name)).toContain('corda');
  });
  it('picks the best-fit lane per candidate across requested lanes', async () => {
    // Wombat breakdown: slop 100, phon 100, distinct 45.
    // literal (0.3/0.3/0.4): 30 + 30 + 18 = 78. weird (0.5/0.25/0.25): 50 + 25 + 11.25 -> 86.
    const r = await executeNameProject({ mode: 'brief', brief: 'x', candidates: ['Wombat'], lanes: ['literal', 'weird'] });
    expect(r.shortlist[0].lane).toBe('weird');
    expect(r.shortlist[0].total).toBe(86);
  });
  it('dedupes candidates case-insensitively keeping the first casing seen', async () => {
    const r = await executeNameProject({ mode: 'brief', brief: 'x', candidates: ['Corda', 'CORDA', 'corda'] });
    expect(r.shortlist.map((s) => s.name)).toEqual(['Corda']);
    expect(r.notes[0]).toContain('1 candidates received');
  });
});
