# Domain Search MCP

<a href="https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp/badge" alt="Domain Search MCP on Glama" />
</a>

Fast domain availability aggregator for AI assistants. Check domain availability across Porkbun, Namecheap, GoDaddy, RDAP, and WHOIS. Compare pricing. Get AI-powered suggestions.

Built with the [Model Context Protocol (MCP)](https://anthropic.com/model-context-protocol) for seamless integration with Claude Code, Codex, VS Code, Cursor, Cline, and other MCP-compatible clients.

## Get Started in 60 Seconds

### 1. Install

```bash
# Clone the repository
git clone https://github.com/dorukardahan/domain-search-mcp.git
cd domain-search-mcp

# Install dependencies
npm install

# Build
npm run build
```

### 2. Configure Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "domain-search": {
      "command": "node",
      "args": ["/path/to/domain-search-mcp/dist/server.js"]
    }
  }
}
```

### 3. Start Searching

Open your MCP-compatible client and ask:

> "Check if vibecoding is available as a domain"

Claude will use the MCP server to search `.com`, `.io`, and `.dev` by default:

```
vibecoding.com - Available - $8.95/year (Porkbun)
vibecoding.io  - Available - $29.88/year (Porkbun)
vibecoding.dev - Available - $10.18/year (Porkbun)

✅ 3 domains available! Best price: vibecoding.com at $8.95/year
💡 .com is the classic, universal choice — trusted worldwide
💡 .io is popular with tech startups and SaaS products
```

## Features

### 7 Powerful Tools

| Tool | What it does |
|------|--------------|
| **search_domain** | Check availability across multiple TLDs with pricing |
| **bulk_search** | Check up to 100 domains at once |
| **compare_registrars** | Find the best price across registrars |
| **suggest_domains** | Get available variations when your name is taken |
| **suggest_domains_smart** | AI-powered suggestions from keywords or descriptions |
| **tld_info** | Learn about TLDs, restrictions, and typical pricing |
| **check_socials** | Verify if usernames are available on GitHub, Twitter, Instagram |

### Works Without API Keys

The server uses **RDAP** and **WHOIS** as fallbacks, so you can start using it immediately without any API keys. However, for pricing information and faster results, we recommend configuring at least Porkbun:

```bash
# Copy the example environment file
cp .env.example .env

# Edit and add your keys
nano .env
```

### Supported Registrars

| Registrar | API Type | Pricing | Notes |
|-----------|----------|---------|-------|
| **Porkbun** | JSON | Free | Fast, includes WHOIS privacy |
| **Namecheap** | XML | Free | Requires IP whitelist |
| **GoDaddy** | MCP | Free | Via GoDaddy MCP server (no API key needed) |

### Fallback Protocols

| Protocol | Speed | Pricing | Authentication |
|----------|-------|---------|----------------|
| **RDAP** | Fast | No | None required |
| **WHOIS** | Slow | No | None required |

## Tool Examples

### search_domain

Check if a domain is available across multiple TLDs:

```typescript
// Input
{
  "domain_name": "vibecoding",
  "tlds": ["com", "io", "dev"]
}

// Output
{
  "results": [
    {
      "domain": "vibecoding.com",
      "available": true,
      "price_first_year": 8.95,
      "price_renewal": 8.95,
      "privacy_included": true,
      "registrar": "porkbun",
      "source": "porkbun_api"
    },
    // ... more results
  ],
  "insights": [
    "✅ 3 domains available! Best price: vibecoding.com at $8.95/year",
    "💡 .com is the classic, universal choice — trusted worldwide"
  ],
  "next_steps": [
    "Check social handle availability (GitHub, X, Instagram)",
    "Register vibecoding.com at porkbun to secure it"
  ]
}
```

### bulk_search

Check many domains at once:

```typescript
// Input
{
  "domains": ["vibecoding", "coolstartup", "myawesomeapp"],
  "tld": "io"
}

// Output
{
  "results": [/* array of domain results */],
  "summary": {
    "total": 3,
    "available": 2,
    "taken": 1,
    "errors": 0
  },
  "insights": [
    "✅ 2 of 3 domains available",
    "💰 Best price: vibecoding.io at $29.88/year"
  ]
}
```

### compare_registrars

Find the best deal:

```typescript
// Input
{
  "domain": "vibecoding",
  "tld": "com",
  "registrars": ["porkbun", "namecheap"]
}

// Output
{
  "domain": "vibecoding.com",
  "what_happened": "Compared pricing across 2 registrars",
  "best_first_year": { "registrar": "namecheap", "price": 8.88 },
  "best_renewal": { "registrar": "porkbun", "price": 8.95 },
  "recommendation": "Namecheap for first year ($0.07 savings), Porkbun for renewal stability"
}
```

### suggest_domains

Get variations when your preferred name is taken:

```typescript
// Input
{
  "base_name": "vibecoding",
  "tld": "com",
  "max_suggestions": 5
}

// Output
{
  "suggestions": [
    { "domain": "getvibecoding.com", "price_first_year": 8.95 },
    { "domain": "vibecodingapp.com", "price_first_year": 8.95 },
    { "domain": "tryvibecoding.com", "price_first_year": 8.95 }
  ],
  "insights": [
    "✅ Found 5 available variations",
    "⭐ Top suggestion: getvibecoding.com ($8.95/year)"
  ]
}
```

### suggest_domains_smart

AI-powered domain suggestions using semantic analysis:

```typescript
// Input - natural language query
{
  "query": "ai customer service chatbot",
  "tld": "io",
  "industry": "tech",  // optional - auto-detected
  "style": "brandable", // brandable, descriptive, short, creative
  "max_suggestions": 10
}

// Output
{
  "query": "ai customer service chatbot",
  "detected_words": ["ai", "customer", "service", "chat", "bot"],
  "detected_industry": "tech",
  "results": {
    "available": [
      {
        "domain": "servicebotai.io",
        "price_first_year": 32.98,
        "premium": false,
        "score": 72
      },
      {
        "domain": "chatservicehub.io",
        "price_first_year": 32.98,
        "premium": false,
        "score": 68
      }
    ],
    "premium": [],
    "unavailable_count": 15
  },
  "insights": [
    "🎯 Detected industry: tech",
    "✅ Found 8 available domains",
    "⭐ Top pick: servicebotai.io ($32.98/yr)"
  ],
  "related_terms": ["neural", "cognitive", "assist", "connect"]
}
```

**Features:**
- **Dual-Source Suggestions**: Combines semantic analysis + GoDaddy AI recommendations
- Understands natural language queries ("coffee shop in seattle")
- Auto-detects industry for contextual suggestions
- Generates portmanteau/blended names
- Multiple style modes (brandable, short, creative)
- Premium domain detection

### tld_info

Learn about a TLD:

```typescript
// Input
{
  "tld": "dev"
}

// Output
{
  "tld": "dev",
  "description": "Developer - for software developers and their projects",
  "typical_use": "Developer portfolios, tools, documentation sites",
  "price_range": { "min": 10.18, "max": 19.99, "currency": "USD" },
  "restrictions": ["Requires HTTPS (HSTS preloaded)"],
  "popularity": "medium",
  "recommendation": "Ideal for developers and tech portfolios (requires HTTPS)"
}
```

### check_socials

Verify username availability across 10 platforms:

```typescript
// Input
{
  "name": "vibecoding",
  "platforms": ["github", "twitter", "instagram"]
}

// Output
{
  "name": "vibecoding",
  "results": [
    { "platform": "github", "available": true, "confidence": "high" },
    { "platform": "twitter", "available": false, "confidence": "high" },
    { "platform": "instagram", "available": true, "confidence": "low" }
  ],
  "insights": [
    "✅ vibecoding is available on: github",
    "❌ vibecoding is taken on: twitter",
    "⚠️ Could not reliably check: instagram (check manually)"
  ]
}
```

**v1.2.1 Improvements:**
- **Twitter**: Uses oembed API for reliable detection (no more false positives)
- **Smart Caching**: Taken usernames cached 24h, available 1h, errors 5min
- **Rate Limit Handling**: Automatic 429 detection with graceful error reporting

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Porkbun API (optional, but recommended for pricing)
# Get your free key at: https://porkbun.com/account/api
PORKBUN_API_KEY=your_api_key_here
PORKBUN_API_SECRET=your_api_secret_here

# Namecheap API (optional, requires IP whitelist)
NAMECHEAP_API_KEY=your_api_key_here
NAMECHEAP_API_USER=your_username_here

# Logging
LOG_LEVEL=info  # debug | info | warn | error

# Cache TTLs (in seconds)
CACHE_TTL_AVAILABILITY=300   # 5 minutes
CACHE_TTL_PRICING=3600       # 1 hour

# Rate limiting
RATE_LIMIT_PER_MINUTE=60

# TLD restrictions (comma-separated)
ALLOWED_TLDS=com,io,dev,app,co,net,org,xyz,ai,sh,me,cc
DENY_TLDS=localhost,internal,test,local
```

### IDE Integration

#### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "servers": {
    "domain-search": {
      "command": "node",
      "args": ["/path/to/domain-search-mcp/dist/server.js"]
    }
  }
}
```

#### Cline

Add to your Cline settings to enable MCP servers.

## Development

### Setup

```bash
# Install dependencies
npm install

# Run in development mode (hot reload)
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests with coverage
npm run coverage
```

### Project Structure

```
domain-search-mcp/
├── src/
│   ├── server.ts           # MCP server entry point
│   ├── config.ts           # Environment configuration
│   ├── types.ts            # TypeScript interfaces
│   ├── tools/              # MCP tool implementations
│   │   ├── search_domain.ts
│   │   ├── bulk_search.ts
│   │   ├── compare_registrars.ts
│   │   ├── suggest_domains.ts
│   │   ├── suggest_domains_smart.ts  # AI-powered suggestions
│   │   ├── tld_info.ts
│   │   └── check_socials.ts
│   ├── registrars/         # Registrar adapters
│   │   ├── base.ts
│   │   ├── porkbun.ts
│   │   ├── namecheap.ts
│   │   └── godaddy-mcp.ts  # GoDaddy via MCP server
│   ├── fallbacks/          # RDAP and WHOIS fallbacks
│   │   ├── rdap.ts
│   │   └── whois.ts
│   ├── services/           # Business logic
│   │   └── domain-search.ts
│   └── utils/              # Utilities
│       ├── logger.ts
│       ├── cache.ts
│       ├── errors.ts
│       ├── validators.ts
│       └── semantic-engine.ts  # Word segmentation & suggestions
├── tests/
│   ├── unit/
│   └── integration/
├── examples/
├── package.json
├── tsconfig.json
└── README.md
```

## Error Handling

The server provides user-friendly error messages with suggested actions:

```json
{
  "error": true,
  "code": "RATE_LIMIT",
  "message": "Too many requests to porkbun. Please slow down.",
  "retryable": true,
  "suggestedAction": "Wait 30 seconds before trying again."
}
```

### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `INVALID_DOMAIN` | Domain name format is invalid | No |
| `UNSUPPORTED_TLD` | TLD is not supported | No |
| `RATE_LIMIT` | Too many requests | Yes |
| `AUTH_ERROR` | API credentials invalid | No |
| `REGISTRAR_API_ERROR` | Registrar API failed | Depends |
| `NO_SOURCE_AVAILABLE` | All sources failed | Yes |
| `TIMEOUT` | Request timed out | Yes |

## Rate Limiting & Performance Optimization

### Understanding WHOIS/RDAP Rate Limits

When operating without API keys, Domain Search MCP uses WHOIS and RDAP protocols as fallbacks. These protocols have important rate limiting considerations:

| Protocol | Typical Rate Limit | Behavior When Exceeded |
|----------|-------------------|------------------------|
| **RDAP** | 10-50 req/min per TLD | Returns 429 or connection refused |
| **WHOIS** | 5-20 req/min per server | Connection timeout or ban |

### Automatic Rate Limit Handling

The server implements intelligent rate limit handling:

```typescript
// Built-in protections
{
  // Automatic exponential backoff
  retryStrategy: {
    initialDelay: 1000,      // Start with 1 second
    maxDelay: 30000,         // Cap at 30 seconds
    backoffMultiplier: 2,    // Double each retry
    maxRetries: 3            // Give up after 3 attempts
  },

  // Per-source rate limiting
  rateLimits: {
    rdap: { requestsPerMinute: 30, burstLimit: 5 },
    whois: { requestsPerMinute: 10, burstLimit: 3 }
  }
}
```

### Strategies for High-Volume Searches

When performing bulk searches without API keys, use these optimization strategies:

#### 1. Use Caching Effectively

```typescript
// Results are cached automatically
// - Availability: 5 minutes (CACHE_TTL_AVAILABILITY)
// - Pricing: 1 hour (CACHE_TTL_PRICING)
// - TLD info: 24 hours

// Subsequent checks for the same domain are instant
const first = await searchDomain("example.com");  // API call
const second = await searchDomain("example.com"); // Cache hit (no API call)
```

#### 2. Batch Domains by TLD

```typescript
// GOOD: Group by TLD to minimize server switches
const comDomains = ["app1", "app2", "app3"];
const ioDomains = ["startup1", "startup2"];

await bulkSearch({ domains: comDomains, tld: "com" }); // One .com server
await bulkSearch({ domains: ioDomains, tld: "io" });   // One .io server

// BAD: Mixed TLDs cause more server connections
await Promise.all([
  searchDomain("app1.com"),
  searchDomain("startup1.io"),
  searchDomain("app2.com"),  // Back to .com server
]);
```

#### 3. Control Concurrency

```typescript
// bulk_search has built-in concurrency control
{
  "domains": ["name1", "name2", ..., "name50"],
  "tld": "com",
  "concurrency": 5  // Process 5 at a time (default)
}
```

#### 4. Implement Request Queuing

For very high volumes, implement client-side queuing:

```typescript
// Example: Rate-limited queue for 100+ domains
async function queuedBulkSearch(domains: string[], tld: string) {
  const BATCH_SIZE = 25;
  const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds

  const results = [];
  for (let i = 0; i < domains.length; i += BATCH_SIZE) {
    const batch = domains.slice(i, i + BATCH_SIZE);
    const batchResults = await bulkSearch({ domains: batch, tld });
    results.push(...batchResults.results);

    // Wait between batches to avoid rate limits
    if (i + BATCH_SIZE < domains.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }
  }
  return results;
}
```

### Why API Keys Are Recommended

| Feature | Without API Keys | With API Keys | With GoDaddy MCP |
|---------|-----------------|---------------|------------------|
| Speed | 2-5 sec/domain | 100-200ms/domain | 200-500ms/domain |
| Rate Limits | Strict (10-50/min) | Generous (1000+/min) | Moderate |
| Pricing Data | Not available | Full pricing info | Full pricing info |
| Reliability | Varies by server | Consistent | Consistent |
| Bulk Operations | Limited to ~50/batch | Up to 100/batch | Supported |
| Setup Required | None | API key setup | MCP server only |

> **Tip**: GoDaddy MCP provides a middle ground - no API key needed but still gives pricing data!

### Handling Rate Limit Errors

```typescript
// The server returns structured errors for rate limits
{
  "error": true,
  "code": "RATE_LIMIT",
  "message": "WHOIS rate limit exceeded for .com TLD",
  "retryable": true,
  "retryAfter": 30,  // Seconds to wait
  "suggestedAction": "Wait 30 seconds or use Porkbun API for faster results"
}

// Your code should handle these gracefully
try {
  const result = await searchDomain("example.com");
} catch (error) {
  if (error.code === "RATE_LIMIT" && error.retryable) {
    await sleep(error.retryAfter * 1000);
    return searchDomain("example.com"); // Retry
  }
  throw error;
}
```

## Workflow Examples

### Workflow 1: Domain Suggestion When Preferred Name is Taken

When a user's preferred domain is unavailable, use `suggest_domains` to find alternatives:

```typescript
// Step 1: Check if preferred domain is available
const preferred = await searchDomain({
  domain_name: "techapp",
  tlds: ["com"]
});

// Step 2: If taken, generate suggestions
if (!preferred.results[0].available) {
  const suggestions = await suggestDomains({
    base_name: "techapp",
    tld: "com",
    max_suggestions: 10,
    variants: ["prefixes", "suffixes", "hyphen", "abbreviations"]
  });

  // Step 3: Present alternatives to user
  console.log("techapp.com is taken. Available alternatives:");
  suggestions.suggestions.forEach(s => {
    console.log(`  ${s.domain} - $${s.price_first_year}/year`);
  });

  // Output:
  // techapp.com is taken. Available alternatives:
  //   gettechapp.com - $8.95/year
  //   techappnow.com - $8.95/year
  //   techapp-io.com - $8.95/year
  //   mytechapp.com - $8.95/year
}
```

### Workflow 2: Simultaneous Social Media Verification

Check username availability across multiple platforms at once:

```typescript
// Check if "myproject" is available on GitHub, Twitter, and Instagram
const socialCheck = await checkSocials({
  name: "myproject",
  platforms: ["github", "twitter", "instagram"]
});

// Handle results by confidence level
const highConfidence = socialCheck.results.filter(r => r.confidence === "high");
const mediumConfidence = socialCheck.results.filter(r => r.confidence === "medium");
const lowConfidence = socialCheck.results.filter(r => r.confidence === "low");

// Report findings
console.log("Verified available:", highConfidence.filter(r => r.available).map(r => r.platform));
console.log("Likely available:", mediumConfidence.filter(r => r.available).map(r => r.platform));
console.log("Check manually:", lowConfidence.map(r => r.platform));

// Output:
// Verified available: ["github"]
// Likely available: ["twitter"]
// Check manually: ["instagram"]
```

### Workflow 3: Complete Brand Validation Pipeline

Comprehensive brand name validation across domains and social media:

```typescript
async function validateBrandName(brandName: string) {
  // Run domain and social checks in parallel
  const [domainResults, socialResults] = await Promise.all([
    searchDomain({
      domain_name: brandName,
      tlds: ["com", "io", "dev", "app"]
    }),
    checkSocials({
      name: brandName,
      platforms: ["github", "twitter", "instagram", "linkedin"]
    })
  ]);

  // Analyze domain availability
  const availableDomains = domainResults.results.filter(r => r.available);
  const bestDomain = availableDomains.sort((a, b) =>
    a.price_first_year - b.price_first_year
  )[0];

  // Analyze social availability
  const availableSocials = socialResults.results.filter(r =>
    r.available && r.confidence !== "low"
  );

  // Calculate brand score
  const domainScore = availableDomains.length / domainResults.results.length;
  const socialScore = availableSocials.length / socialResults.results.length;
  const overallScore = (domainScore + socialScore) / 2;

  return {
    brandName,
    overallScore: Math.round(overallScore * 100),
    domains: {
      available: availableDomains.map(d => d.domain),
      bestOption: bestDomain?.domain,
      bestPrice: bestDomain?.price_first_year
    },
    socials: {
      available: availableSocials.map(s => s.platform),
      needsManualCheck: socialResults.results
        .filter(r => r.confidence === "low")
        .map(s => s.platform)
    },
    recommendation: overallScore > 0.7
      ? "Strong brand availability - proceed with registration"
      : overallScore > 0.4
      ? "Partial availability - consider alternatives"
      : "Limited availability - try a different name"
  };
}

// Usage
const result = await validateBrandName("vibecoding");
// Output:
// {
//   brandName: "vibecoding",
//   overallScore: 85,
//   domains: {
//     available: ["vibecoding.com", "vibecoding.io", "vibecoding.dev"],
//     bestOption: "vibecoding.com",
//     bestPrice: 8.95
//   },
//   socials: {
//     available: ["github", "twitter"],
//     needsManualCheck: ["instagram", "linkedin"]
//   },
//   recommendation: "Strong brand availability - proceed with registration"
// }
```

### Workflow 4: Handling Partial Availability Scenarios

When some sources succeed and others fail:

```typescript
async function robustDomainSearch(domainName: string, tlds: string[]) {
  const results = await searchDomain({ domain_name: domainName, tlds });

  // Separate successful and failed checks
  const successful = results.results.filter(r => !r.error);
  const failed = results.results.filter(r => r.error);

  // Handle partial failures
  if (failed.length > 0) {
    console.log(`Warning: ${failed.length} TLDs could not be checked:`);
    failed.forEach(f => console.log(`  ${f.domain}: ${f.error}`));

    // Retry failed ones with exponential backoff
    for (const failedResult of failed) {
      const tld = failedResult.domain.split('.').pop();
      let retryDelay = 1000;

      for (let attempt = 1; attempt <= 3; attempt++) {
        await new Promise(r => setTimeout(r, retryDelay));
        try {
          const retry = await searchDomain({
            domain_name: domainName,
            tlds: [tld]
          });
          if (!retry.results[0].error) {
            successful.push(retry.results[0]);
            break;
          }
        } catch (e) {
          retryDelay *= 2; // Exponential backoff
        }
      }
    }
  }

  return {
    results: successful,
    partialFailure: failed.length > 0,
    failedTlds: failed.map(f => f.domain.split('.').pop())
  };
}
```

### Workflow 5: Domain Research Pipeline

Comprehensive domain research combining multiple tools:

```typescript
async function domainResearchPipeline(businessIdea: string) {
  // Step 1: Generate smart suggestions from business description
  const suggestions = await suggestDomainsSmart({
    query: businessIdea,
    tld: "com",
    style: "brandable",
    max_suggestions: 15
  });

  // Step 2: Get TLD information for context
  const tldInfo = await getTldInfo({ tld: "com", detailed: true });

  // Step 3: For top suggestions, compare registrar pricing
  const topDomains = suggestions.results.available.slice(0, 5);
  const priceComparisons = await Promise.all(
    topDomains.map(d => compareRegistrars({
      domain: d.domain.replace('.com', ''),
      tld: "com"
    }))
  );

  // Step 4: Check social media for top picks
  const socialChecks = await Promise.all(
    topDomains.slice(0, 3).map(d => {
      const name = d.domain.replace('.com', '');
      return checkSocials({
        name,
        platforms: ["github", "twitter", "npm"]
      });
    })
  );

  // Compile research report
  return {
    businessIdea,
    tldContext: {
      description: tldInfo.description,
      priceRange: tldInfo.price_range,
      recommendation: tldInfo.recommendation
    },
    topRecommendations: topDomains.map((d, i) => ({
      domain: d.domain,
      price: d.price_first_year,
      bestRegistrar: priceComparisons[i]?.best_first_year?.registrar,
      socialAvailability: socialChecks[i]?.summary
    })),
    allSuggestions: suggestions.results.available,
    relatedTerms: suggestions.related_terms
  };
}

// Usage
const research = await domainResearchPipeline("ai-powered code review tool");
```

## Security

- API keys are never logged (automatic secret masking)
- Structured JSON logging for audit trails
- No PII stored or logged
- Rate limiting to prevent abuse

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [MCP Protocol Documentation](https://anthropic.com/model-context-protocol)
- [Porkbun API Docs](https://porkbun.com/api/json/v3/documentation)
- [Namecheap API Docs](https://www.namecheap.com/support/api/intro/)
- [RDAP RFC 7480](https://datatracker.ietf.org/doc/html/rfc7480)

---

Built with care for the vibecoding community. Magic in under 60 seconds.
