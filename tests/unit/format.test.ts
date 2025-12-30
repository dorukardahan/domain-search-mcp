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
});
