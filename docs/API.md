# API Reference

Complete API documentation for Domain Search MCP.

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
    privacy_included: boolean;
    registrar: string | null;
    source: "porkbun_api" | "namecheap_api" | "godaddy_api" | "rdap" | "whois" | "pricing_api" | "catalog";
    premium: boolean;
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

Check up to 100 domains at once with rate limiting.

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
