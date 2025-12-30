import type {
  Config,
  DomainResult,
  RegistrarComparison,
  SearchResponse,
  TLDInfo,
  SocialHandleResult,
} from '../types.js';

type OutputFormat = Config['outputFormat'];

type ToolResult =
  | SearchResponse
  | RegistrarComparison
  | { results: DomainResult[]; summary?: Record<string, number>; insights?: string[] }
  | { suggestions: Array<{ domain: string; price_first_year: number | null; registrar: string; score: number }>; insights?: string[] }
  | { results: { available: DomainResult[]; premium: DomainResult[]; unavailable_count: number }; insights?: string[] }
  | { name: string; results: SocialHandleResult[]; insights?: string[] }
  | TLDInfo
  | Record<string, unknown>;

function formatMoney(value: number | null, currency: string): string {
  if (value === null || Number.isNaN(value)) return 'N/A';
  return `${currency} ${value.toFixed(2)}`;
}

function formatPriceSummary(result: DomainResult): string {
  if (result.price_first_year === null) return 'N/A';
  const first = formatMoney(result.price_first_year, result.currency);
  if (result.price_renewal === null) {
    return first;
  }
  const renewal = formatMoney(result.price_renewal, result.currency);
  return `${first} / ${renewal} renew`;
}

function formatPriceFirstYear(result: DomainResult): string {
  if (result.price_first_year === null) return 'N/A';
  return formatMoney(result.price_first_year, result.currency);
}

function formatPricingLabel(result: DomainResult): string {
  switch (result.pricing_status) {
    case 'ok':
      return 'current';
    case 'partial':
      return 'recent';
    case 'catalog_only':
      return 'estimate';
    case 'not_available':
      return 'rate-limited';
    case 'not_configured':
      return 'no-backend';
    case 'error':
      return 'error';
    default:
      return '-';
  }
}

function formatLinks(result: DomainResult): string {
  const links: string[] = [];
  if (result.price_check_url) {
    links.push(`[price](${result.price_check_url})`);
  }
  if (result.aftermarket?.url) {
    const label =
      result.aftermarket.source === 'sedo'
        ? 'sedo'
        : result.aftermarket.type;
    links.push(`[${label}](${result.aftermarket.url})`);
  }
  return links.length > 0 ? links.join(' ') : '-';
}

function renderTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return [headerRow, separator, body].filter(Boolean).join('\n');
}

const PRICE_DISCLAIMER =
  'Note: Prices can change. Always verify at registrar checkout links.';

function formatDomainResultsTable(results: DomainResult[]): string {
  const headers = ['Domain', 'Status', 'Price', 'Pricing', 'Registrar', 'Links'];
  const rows = results.map((result) => [
    result.domain,
    result.available ? 'Available' : 'Taken',
    formatPriceSummary(result),
    formatPricingLabel(result),
    result.registrar || 'unknown',
    formatLinks(result),
  ]);
  return renderTable(headers, rows);
}

function formatSearchResponse(result: SearchResponse): string {
  const sections: string[] = [];
  sections.push(formatDomainResultsTable(result.results));
  sections.push(PRICE_DISCLAIMER);
  if (result.insights?.length) {
    sections.push(`\nInsights:\n- ${result.insights.join('\n- ')}`);
  }
  if (result.next_steps?.length) {
    sections.push(`\nNext steps:\n- ${result.next_steps.join('\n- ')}`);
  }
  return sections.join('\n');
}

function formatBulkResponse(result: { results: DomainResult[]; summary?: Record<string, number>; insights?: string[] }): string {
  const sections: string[] = [];
  if (result.summary) {
    const summaryParts = Object.entries(result.summary)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    sections.push(`Summary: ${summaryParts}`);
  }
  sections.push(formatDomainResultsTable(result.results));
  sections.push(PRICE_DISCLAIMER);
  if (result.insights?.length) {
    sections.push(`\nInsights:\n- ${result.insights.join('\n- ')}`);
  }
  return sections.join('\n');
}

function formatComparison(result: RegistrarComparison): string {
  const headers = ['Registrar', 'Price', 'Renewal', 'Premium', 'Pricing', 'Links'];
  const rows = result.comparisons.map((entry) => [
    entry.registrar || 'unknown',
    formatPriceFirstYear(entry),
    entry.price_renewal === null ? 'N/A' : formatMoney(entry.price_renewal, entry.currency),
    entry.premium ? 'Yes' : 'No',
    formatPricingLabel(entry),
    formatLinks(entry),
  ]);
  const sections: string[] = [];
  sections.push(`Comparison for ${result.domain}`);
  sections.push(renderTable(headers, rows));
  sections.push(PRICE_DISCLAIMER);
  if (result.best_first_year) {
    sections.push(
      `Best first year: ${result.best_first_year.registrar} at ${formatMoney(
        result.best_first_year.price,
        result.best_first_year.currency,
      )}`,
    );
  }
  if (result.best_renewal) {
    sections.push(
      `Best renewal: ${result.best_renewal.registrar} at ${formatMoney(
        result.best_renewal.price,
        result.best_renewal.currency,
      )}`,
    );
  }
  if (result.recommendation) {
    sections.push(`Recommendation: ${result.recommendation}`);
  }
  return sections.join('\n');
}

function formatSuggestions(result: {
  suggestions: Array<{ domain: string; price_first_year: number | null; registrar: string; score: number }>;
  insights?: string[];
}): string {
  const headers = ['Domain', 'Price', 'Registrar', 'Score'];
  const rows = result.suggestions.map((entry) => [
    entry.domain,
    entry.price_first_year === null ? 'N/A' : formatMoney(entry.price_first_year, 'USD'),
    entry.registrar || 'unknown',
    entry.score.toString(),
  ]);
  const sections: string[] = [];
  sections.push(renderTable(headers, rows));
  sections.push(PRICE_DISCLAIMER);
  if (result.insights?.length) {
    sections.push(`\nInsights:\n- ${result.insights.join('\n- ')}`);
  }
  return sections.join('\n');
}

function formatSmartSuggestions(result: {
  results: { available: DomainResult[]; premium: DomainResult[]; unavailable_count: number };
  insights?: string[];
}): string {
  const sections: string[] = [];
  if (result.results.available.length > 0) {
    sections.push('Available');
    sections.push(formatDomainResultsTable(result.results.available));
  }
  if (result.results.premium.length > 0) {
    sections.push('\nPremium');
    sections.push(formatDomainResultsTable(result.results.premium));
  }
  if (result.results.available.length > 0 || result.results.premium.length > 0) {
    sections.push(PRICE_DISCLAIMER);
  }
  if (result.results.unavailable_count > 0) {
    sections.push(`\nUnavailable: ${result.results.unavailable_count}`);
  }
  if (result.insights?.length) {
    sections.push(`\nInsights:\n- ${result.insights.join('\n- ')}`);
  }
  return sections.join('\n');
}

function formatTldInfo(result: TLDInfo): string {
  const headers = ['Field', 'Value'];
  const rows = [
    ['TLD', `.${result.tld}`],
    ['Description', result.description],
    ['Typical use', result.typical_use],
    [
      'Price range',
      `${result.price_range.currency} ${result.price_range.min}-${result.price_range.max}`,
    ],
    [
      'Renewal',
      `${result.price_range.currency} ${result.renewal_price_typical}`,
    ],
    ['Restrictions', result.restrictions.length > 0 ? result.restrictions.join(', ') : 'None'],
    ['Popularity', result.popularity],
    ['Category', result.category],
  ];
  return renderTable(headers, rows);
}

function formatSocials(result: { name: string; results: SocialHandleResult[]; insights?: string[] }): string {
  const headers = ['Platform', 'Available', 'Confidence', 'URL'];
  const rows = result.results.map((entry) => [
    entry.platform,
    entry.available ? 'Yes' : 'No',
    entry.confidence,
    `[link](${entry.url})`,
  ]);
  const sections: string[] = [];
  sections.push(renderTable(headers, rows));
  if (result.insights?.length) {
    sections.push(`\nInsights:\n- ${result.insights.join('\n- ')}`);
  }
  return sections.join('\n');
}

export function formatToolResult(
  name: string,
  result: unknown,
  format: OutputFormat,
): string {
  const typed = result as ToolResult;
  if (format === 'json') {
    return JSON.stringify(typed, null, 2);
  }

  let text = '';

  switch (name) {
    case 'search_domain':
      text = formatSearchResponse(typed as SearchResponse);
      break;
    case 'bulk_search':
      text = formatBulkResponse(typed as { results: DomainResult[]; summary?: Record<string, number>; insights?: string[] });
      break;
    case 'compare_registrars':
      text = formatComparison(typed as RegistrarComparison);
      break;
    case 'suggest_domains':
      text = formatSuggestions(typed as {
        suggestions: Array<{ domain: string; price_first_year: number | null; registrar: string; score: number }>;
        insights?: string[];
      });
      break;
    case 'suggest_domains_smart':
      text = formatSmartSuggestions(typed as {
        results: { available: DomainResult[]; premium: DomainResult[]; unavailable_count: number };
        insights?: string[];
      });
      break;
    case 'tld_info':
      text = formatTldInfo(typed as TLDInfo);
      break;
    case 'check_socials':
      text = formatSocials(typed as { name: string; results: SocialHandleResult[]; insights?: string[] });
      break;
    default:
      text = `Output format not implemented for ${name}. Set OUTPUT_FORMAT=json for raw output.`;
  }

  if (format === 'both') {
    return `${text}\n\n\`\`\`json\n${JSON.stringify(typed, null, 2)}\n\`\`\``;
  }

  return text;
}

export function formatToolError(
  error: { code?: string; userMessage?: string; retryable?: boolean; suggestedAction?: string },
  format: OutputFormat,
): string {
  const payload = {
    error: true,
    code: error.code || 'unknown',
    message: error.userMessage || 'Unknown error',
    retryable: error.retryable ?? false,
    suggestedAction: error.suggestedAction,
  };

  if (format === 'json' || format === 'both') {
    const json = JSON.stringify(payload, null, 2);
    return format === 'both'
      ? `Error:\n${payload.message}\n\n\`\`\`json\n${json}\n\`\`\``
      : json;
  }

  const lines = [
    `Error: ${payload.message}`,
    `Code: ${payload.code}`,
    `Retryable: ${payload.retryable ? 'yes' : 'no'}`,
  ];
  if (payload.suggestedAction) {
    lines.push(`Suggested action: ${payload.suggestedAction}`);
  }
  return lines.join('\n');
}
