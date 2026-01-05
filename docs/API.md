# API Reference

Complete API documentation for Domain Search MCP.

> Note: Tool outputs are returned as Markdown tables by default.  
> Set `OUTPUT_FORMAT=json` to get raw JSON matching the schemas below.

## search_domain

Check domain availability across multiple TLDs with pricing.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `domain_name` | string | Yes | - | Domain name without TLD |
| `tlds` | string[] | No | `["com", "io", "dev"]` | TLDs to check |
| `registrars` | string[] | No | auto | Specific registrars to query (BYOK only; ignored when Pricing API is configured) |

### Response

```typescript
interface SearchDomainResponse {
  results: Array<{
    domain: string;              // "vibecoding.com"
    available: boolean;
    price_first_year: number | null;
    price_renewal: number | null;
    price_check_url?: string;
    price_note?: string;
    privacy_included: boolean;
    registrar: string | null;
    source: "porkbun_api" | "namecheap_api" | "godaddy_api" | "rdap" | "whois" | "pricing_api" | "catalog";
    premium: boolean;
    aftermarket?: {
      type: "auction" | "aftermarket" | "premium";
      price: number | null;
      currency: string | null;
      source: string;
      url?: string;
      note?: string;
    };
    pricing_source?: "pricing_api" | "catalog" | "porkbun_api" | "namecheap_api";
    pricing_status?: "ok" | "partial" | "not_configured" | "error" | "catalog_only" | "not_available";
    error?: string;
  }>;
  insights: string[];
  next_steps: string[];
  query: {
    domain_name: string;
    tlds: string[];
    checked_at: string;
  };
}
```

### Example

```typescript
const result = await searchDomain({
  domain_name: "vibecoding",
  tlds: ["com", "io", "dev"]
});

// result.results[0]:
// {
//   domain: "vibecoding.com",
//   available: true,
//   price_first_year: 8.95,
//   price_renewal: 8.95,
//   price_check_url: "https://porkbun.com/checkout/search?q=vibecoding.com",
//   privacy_included: true,
//   registrar: "porkbun",
//   source: "rdap",
//   pricing_source: "pricing_api",
//   pricing_status: "ok",
//   premium: false
// }
```

---

## bulk_search

Check up to 100 domains at once. Live pricing is attempted first for available domains,
then falls back to catalog estimates when rate-limited or unavailable.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `domains` | string[] | Yes | - | Domain names (max 100) |
| `tld` | string | No | "com" | Single TLD for all domains |
| `registrar` | string | No | auto | Specific registrar (BYOK only; ignored when Pricing API is configured) |

### Response

```typescript
interface BulkSearchResponse {
  results: Array<{
    domain: string;
    available: boolean;
    price_first_year: number | null;
    price_check_url?: string;
    price_note?: string;
    error?: string;
  }>;
  summary: {
    total: number;
    available: number;
    taken: number;
    errors: number;
    duration_ms: number;
  };
  insights: string[];
}
```

### Example

```typescript
const result = await bulkSearch({
  domains: ["startup1", "startup2", "startup3"],
  tld: "io"
});

// result.summary: { total: 3, available: 2, taken: 1, errors: 0 }
```

---

## compare_registrars

Compare pricing across multiple registrars.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `domain` | string | Yes | - | Domain name without TLD |
| `tld` | string | Yes | - | TLD to check |
| `registrars` | string[] | No | all available | Registrars to compare |

### Response

```typescript
interface CompareRegistrarsResponse {
  domain: string;
  comparisons: Array<{
    registrar: string;
    available: boolean;
    price_first_year: number | null;
    price_renewal: number | null;
    price_transfer: number | null;
    currency: string | null;
    price_check_url?: string;
    price_note?: string;
    aftermarket?: {
      type: "auction" | "aftermarket" | "premium";
      price: number | null;
      currency: string | null;
      source: string;
      url?: string;
      note?: string;
    };
    pricing_source?: "pricing_api" | "catalog";
    pricing_status?: "ok" | "partial" | "not_configured" | "error" | "catalog_only" | "not_available";
  }>;
  best_first_year: { registrar: string; price: number; currency: string } | null;
  best_renewal: { registrar: string; price: number; currency: string } | null;
  recommendation: string;
  insights: string[];
}
```

---

## suggest_domains

Generate domain variations when preferred name is taken.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `base_name` | string | Yes | - | Base domain name |
| `tld` | string | No | "com" | Target TLD |
| `max_suggestions` | number | No | 10 | Max results (1-50) |
| `variants` | string[] | No | all | Variant types |

### Variant Types

| Variant | Example (base: "techapp") |
|---------|---------------------------|
| `prefixes` | gettechapp, trytechapp |
| `suffixes` | techappnow, techapphq |
| `hyphen` | tech-app |
| `abbreviations` | tchapp |
| `numbers` | techapp1 |

### Response

```typescript
interface SuggestDomainsResponse {
  base_name: string;
  tld: string;
  suggestions: Array<{
    domain: string;
    available: boolean;  // always true
    price_first_year: number | null;
    variant_type: string;
  }>;
  searched_count: number;
  available_count: number;
  insights: string[];
}
```

---

## suggest_domains_smart

AI-powered suggestions from keywords or descriptions.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Keywords or description |
| `tld` | string | No | "com" | Target TLD |
| `industry` | string | No | auto | Industry context |
| `style` | string | No | "brandable" | Suggestion style |
| `max_suggestions` | number | No | 15 | Max results |
| `include_premium` | boolean | No | false | Include premium domains |

### Styles

- `brandable` - Creative, memorable names
- `descriptive` - Clear, descriptive names
- `short` - Minimal length names
- `creative` - Unique, inventive names

### Industries

tech, startup, finance, health, food, creative, ecommerce, education, gaming, social

---

## tld_info

Get TLD information and recommendations.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tld` | string | Yes | - | TLD to look up |
| `detailed` | boolean | No | false | Include extra info |

### Response

```typescript
interface TldInfoResponse {
  tld: string;
  description: string;
  typical_price: { min: number; max: number };
  restrictions: string | null;
  popularity: "high" | "medium" | "low";
  recommended_for: string[];
  insights: string[];
}
```

---

## check_socials

Check username availability on social platforms.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | - | Username to check |
| `platforms` | string[] | No | default set | Platforms to check |

### Platforms

| Platform | Confidence | Notes |
|----------|------------|-------|
| github | High | Public API |
| npm | High | Public API |
| pypi | High | Public API |
| twitter | High | Public API |
| reddit | High | Public API |
| youtube | Medium | Status code based |
| producthunt | Medium | Status code based |
| instagram | Low | Blocks automation |
| linkedin | Low | Blocks automation |
| tiktok | Low | Blocks automation |

### Response

```typescript
interface CheckSocialsResponse {
  name: string;
  results: Array<{
    platform: string;
    available: boolean;
    confidence: "high" | "medium" | "low";
    url: string;
    error?: string;
  }>;
  summary: {
    available: number;
    taken: number;
    errors: number;
  };
  insights: string[];
}
```

---

## analyze_project

Scan a local project or GitHub repository and suggest matching domain names.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | Yes | - | Local path or GitHub URL |
| `tld` | string | No | "com" | Primary TLD for suggestions |
| `suggest_domains` | boolean | No | true | Auto-generate suggestions |
| `style` | string | No | "brandable" | Suggestion style |
| `max_suggestions` | number | No | 10 | Max suggestions (1-30) |
| `include_source_files` | boolean | No | false | Scan source files for keywords |

### Supported Project Types

- Node.js (package.json)
- Python (pyproject.toml, setup.py)
- Rust (Cargo.toml)
- Go (go.mod)
- Any project with README.md

### Response

```typescript
interface AnalyzeProjectResponse {
  project: {
    name: string;
    description: string | null;
    keywords: string[];
    industry: string | null;
    repository_url: string | null;
  };
  suggestions: Array<{
    domain: string;
    available: boolean;
    price_first_year: number | null;
    score: number;
  }>;
  insights: string[];
}
```

---

## hunt_domains

Find valuable domains for investment opportunities.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keywords` | string[] | No | - | Keywords to search/incorporate |
| `tlds` | string[] | No | ["com", "io", "co"] | TLDs to search |
| `patterns` | string[] | No | all | Pattern types to generate |
| `min_length` | number | No | 3 | Minimum domain name length |
| `max_length` | number | No | 12 | Maximum domain name length |
| `score_threshold` | number | No | 40 | Minimum investment score (0-100) |
| `max_results` | number | No | 20 | Max results (1-50) |
| `include_aftermarket` | boolean | No | true | Include Sedo auctions |
| `max_aftermarket_price` | number | No | - | Max aftermarket price (USD) |

### Pattern Types

| Pattern | Description | Example |
|---------|-------------|---------|
| `short` | 3-5 char pronounceable (CVC, CVCV) | zap, velo |
| `dictionary` | Common words as domains | spark, cloud |
| `brandable` | Keyword + modern suffixes | chatly, appify |
| `acronym` | Abbreviations | ai, api |
| `numeric` | Keyword + numbers | app24, tech7 |

### Investment Score Factors

- Length: Shorter = higher (3-4 chars = +25 points)
- TLD Value: .com = +25, .io/.ai = +15, .co = +12
- Keyword Match: +5 per keyword found
- Pronounceability: Good vowel ratio = +10
- Aftermarket Price: Lower = bonus points

### Response

```typescript
interface HuntDomainsResponse {
  results: Array<{
    domain: string;
    available: boolean;
    investment_score: number;
    price_first_year: number | null;
    aftermarket_price: number | null;
    source: string;
  }>;
  summary: {
    total_checked: number;
    available: number;
    aftermarket: number;
  };
  insights: string[];
}
```

---

## expiring_domains

Monitor domains approaching expiration (requires federated negative cache).

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | number | No | 30 | Expiring within N days |
| `tlds` | string[] | No | all | Filter by TLDs |
| `keywords` | string | No | - | Filter by keywords in domain |
| `limit` | number | No | 25 | Max results (1-100) |

### Response

```typescript
interface ExpiringDomainsResponse {
  domains: Array<{
    domain: string;
    expires_at: string;
    days_remaining: number;
  }>;
  total: number;
  insights: string[];
}
```

### Requirements

This tool requires `NEGATIVE_CACHE_URL` to be configured pointing to a federated negative cache backend.

---

## ai_health

Check health status of AI inference services.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `verbose` | boolean | No | false | Include detailed metrics |

### Response

```typescript
interface AIHealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  services: {
    vps_qwen: {
      status: "up" | "down" | "unknown";
      latency_ms: number | null;
      circuit_state: "closed" | "open" | "half-open";
    };
    together_ai: {
      status: "up" | "down" | "unknown";
      configured: boolean;
    };
    semantic_engine: {
      status: "up";  // Always available (offline)
    };
  };
  adaptive_concurrency: {
    current_concurrency: number;
    current_batch_size: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
  };
  insights: string[];
}
```

### Use Cases

- Diagnosing slow AI suggestions
- Monitoring which inference source is being used
- Checking circuit breaker states
- Verifying infrastructure health

---

## Error Codes

All tools return structured errors:

```typescript
interface ErrorResponse {
  error: true;
  code: string;
  message: string;
  retryable: boolean;
  suggestedAction?: string;
}
```

| Code | Description | Retryable |
|------|-------------|-----------|
| `INVALID_DOMAIN` | Domain format invalid | No |
| `UNSUPPORTED_TLD` | TLD not supported | No |
| `RATE_LIMIT` | Too many requests | Yes |
| `AUTH_ERROR` | API credentials invalid | No |
| `TIMEOUT` | Request timed out | Yes |
| `NO_SOURCE_AVAILABLE` | All sources failed | Yes |
