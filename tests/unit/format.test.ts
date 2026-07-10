import { formatToolResult } from '../../src/utils/format';
import type { SearchResponse, DomainResult } from '../../src/types';

describe('formatToolResult', () => {
  it('renders a compact table with pricing labels and links', () => {
    const result: DomainResult = {
      domain: 'example.com',
      available: true,
      premium: false,
      price_first_year: 9.99,
      price_renewal: 12.99,
      currency: 'USD',
      privacy_included: true,
      transfer_price: null,
      registrar: 'porkbun',
      source: 'pricing_api',
      checked_at: new Date().toISOString(),
      pricing_status: 'ok',
      price_check_url: 'https://porkbun.com/checkout/search?q=example.com',
      aftermarket: {
        type: 'auction',
        price: null,
        currency: null,
        source: 'sedo',
        url: 'https://sedo.com/search/?keyword=example.com',
      },
    };

    const payload: SearchResponse = {
      results: [result],
      insights: [],
      next_steps: [],
      from_cache: false,
      duration_ms: 10,
    };

    const text = formatToolResult('search_domain', payload, 'table');

    expect(text).toContain('| Domain | Status | Price | Pricing | Registrar | Links |');
    expect(text).toContain('USD 9.99 / USD 12.99 renew');
    expect(text).toContain('current');
    expect(text).toContain('[price](');
    expect(text).toContain('[sedo](');
    expect(text).toContain('Note: Prices can change.');
  });

  it('renders name_project phase 1 instructions with the resubmit hint', () => {
    const payload = {
      phase: 1,
      mode: 'brief',
      instructions: 'Brief: an MCP naming engine\n\nNow generate between 30 and 50 name candidates',
      lanes: [{ key: 'evocative', promptFragment: 'Real words borrowed for their feeling.' }],
      resubmit_hint: 'Call name_project again with candidates[] filled to receive the scored, availability-checked shortlist.',
    };

    const text = formatToolResult('name_project', payload, 'table');

    expect(text).toContain('Brief: an MCP naming engine');
    expect(text).toContain('Call name_project again with candidates[] filled');
    expect(text).not.toContain('Output format not implemented');
  });

  it('renders name_project phase 2 shortlist as a table with clearance badges', () => {
    const payload = {
      phase: 2,
      mode: 'brief',
      shortlist: [
        {
          name: 'Corda',
          lane: 'evocative',
          total: 95,
          band: 'strong',
          breakdown: { slop: 100, phonaesthetics: 100, distinctiveness: 80 },
          reasons: ['no AI-slop patterns', 'clean pronunciation and typing', 'a third reason that should be cut'],
          clearance: {
            name: 'Corda',
            verdict: 'partial',
            domains: [
              { domain: 'corda.com', available: true, price_first_year: 11 },
              { domain: 'corda.io', available: null, price_first_year: null },
            ],
            socials: [{ platform: 'github', available: false }],
          },
        },
        {
          name: 'Nexify',
          lane: 'evocative',
          total: 55,
          band: 'middling',
          breakdown: { slop: 0, phonaesthetics: 100, distinctiveness: 80 },
          reasons: ['slop: overused prefix "nex-"', 'slop: overused suffix "-ify"'],
        },
      ],
      notes: ['2 candidates received, 2 passed constraints, top 2 returned.'],
    };

    const text = formatToolResult('name_project', payload, 'table');

    expect(text).toContain('| Name | Score | Verdict | Badges | Why |');
    expect(text).toContain('Corda');
    expect(text).toContain('95 strong');
    expect(text).toContain('55 middling');
    expect(text).toContain('com✓');
    expect(text).toContain('io?');
    expect(text).toContain('github✗');
    expect(text).toContain('partial');
    expect(text).toContain('no AI-slop patterns; clean pronunciation and typing');
    expect(text).not.toContain('a third reason that should be cut');
    expect(text).toContain('2 candidates received, 2 passed constraints, top 2 returned.');
  });

  it('renders the FOR-SALE badge for available+premium domains, not the free checkmark', () => {
    const payload = {
      phase: 2,
      mode: 'brief',
      shortlist: [
        {
          name: 'Verdict',
          lane: 'evocative',
          total: 80,
          band: 'strong',
          breakdown: { slop: 100, phonaesthetics: 90, distinctiveness: 80 },
          reasons: ['clean pronunciation and typing'],
          clearance: {
            name: 'Verdict',
            verdict: 'partial',
            domains: [
              { domain: 'verdict.ai', available: true, price_first_year: null, premium: true },
              { domain: 'verdict.com', available: true, price_first_year: 11 },
            ],
            socials: [],
          },
        },
      ],
    };

    const text = formatToolResult('name_project', payload, 'table');

    expect(text).toContain('ai$');
    expect(text).not.toContain('ai✓');
    expect(text).toContain('com✓');
  });

  it('shows the score band next to the numeric score (fake-precision guard)', () => {
    const payload = {
      phase: 2,
      mode: 'brief',
      shortlist: [
        {
          name: 'Ember',
          lane: 'evocative',
          total: 86,
          band: 'strong',
          breakdown: { slop: 100, phonaesthetics: 90, distinctiveness: 80 },
          reasons: ['no AI-slop patterns'],
        },
      ],
    };

    const text = formatToolResult('name_project', payload, 'table');

    expect(text).toContain('86 strong');
  });
});
