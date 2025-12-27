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

**Error Handling and User Presentation:**

```typescript
// Robust comparison with error handling and formatted output
async function comparePricingWithPresentation(domain: string, tld: string) {
  try {
    const result = await compareRegistrars({
      domain: domain,
      tld: tld,
      registrars: ["porkbun", "namecheap"]
    });

    // Format for user presentation
    const presentation = formatPriceComparison(result);
    return { success: true, data: result, formatted: presentation };

  } catch (error) {
    // Handle domain not available
    if (error.code === "DOMAIN_UNAVAILABLE") {
      return {
        success: false,
        error: `${domain}.${tld} is not available for registration`,
        suggestion: "Try suggest_domains to find alternatives"
      };
    }

    // Handle registrar API errors
    if (error.code === "REGISTRAR_API_ERROR") {
      // Try with remaining registrars
      const workingRegistrars = error.failedRegistrars
        ? ["porkbun", "namecheap"].filter(r => !error.failedRegistrars.includes(r))
        : [];

      if (workingRegistrars.length > 0) {
        const partialResult = await compareRegistrars({
          domain, tld,
          registrars: workingRegistrars
        });
        return {
          success: true,
          partial: true,
          data: partialResult,
          note: `Some registrars unavailable. Showing ${workingRegistrars.join(', ')} only.`
        };
      }
    }

    // Handle rate limiting
    if (error.code === "RATE_LIMIT") {
      await new Promise(r => setTimeout(r, error.retryAfter * 1000));
      return comparePricingWithPresentation(domain, tld);
    }

    throw error;
  }
}

// Format comparison for display
function formatPriceComparison(result) {
  const lines = [
    `Domain: ${result.domain}`,
    ``,
    `💰 PRICING COMPARISON`,
    `${'─'.repeat(40)}`,
  ];

  // Add each registrar's pricing
  if (result.registrar_prices) {
    for (const [registrar, prices] of Object.entries(result.registrar_prices)) {
      lines.push(`${registrar.toUpperCase()}`);
      lines.push(`  First year: $${prices.first_year}`);
      lines.push(`  Renewal:    $${prices.renewal}`);
      lines.push(``);
    }
  }

  lines.push(`${'─'.repeat(40)}`);
  lines.push(`RECOMMENDATION`);
  lines.push(`  Best first year: ${result.best_first_year.registrar} ($${result.best_first_year.price})`);
  lines.push(`  Best renewal:    ${result.best_renewal.registrar} ($${result.best_renewal.price})`);
  lines.push(``);
  lines.push(`💡 ${result.recommendation}`);

  return lines.join('\n');
}

// Usage
const comparison = await comparePricingWithPresentation("startup", "io");
if (comparison.success) {
  console.log(comparison.formatted);
}
// Output:
// Domain: startup.io
//
// 💰 PRICING COMPARISON
// ────────────────────────────────────────
// PORKBUN
//   First year: $29.88
//   Renewal:    $29.88
//
// NAMECHEAP
//   First year: $32.98
//   Renewal:    $32.98
//
// ────────────────────────────────────────
// RECOMMENDATION
//   Best first year: porkbun ($29.88)
//   Best renewal:    porkbun ($29.88)
//
// 💡 Porkbun offers the best price for both first year and renewal
```

### suggest_domains

Get variations when your preferred name is taken:

```typescript
// Input
{
  "base_name": "vibecoding",
  "tld": "com",
  "max_suggestions": 5,
  "variants": ["prefixes", "suffixes", "hyphen", "abbreviations"]
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

**Handling Edge Cases:**

```typescript
// Handle scenarios when no alternatives are available
async function getSuggestionsWithFallback(baseName: string, tld: string) {
  try {
    const result = await suggestDomains({
      base_name: baseName,
      tld: tld,
      max_suggestions: 10,
      variants: ["prefixes", "suffixes", "hyphen", "abbreviations", "numbers"]
    });

    // Case 1: No suggestions found
    if (result.suggestions.length === 0) {
      console.log(`No variations available for ${baseName}.${tld}`);

      // Try different TLDs
      const altTlds = ["io", "dev", "app", "co"].filter(t => t !== tld);
      for (const altTld of altTlds) {
        const altResult = await suggestDomains({
          base_name: baseName,
          tld: altTld,
          max_suggestions: 5
        });
        if (altResult.suggestions.length > 0) {
          return {
            originalTld: tld,
            alternativeTld: altTld,
            suggestions: altResult.suggestions,
            message: `No ${tld} available, but found options in .${altTld}`
          };
        }
      }

      // Try smart suggestions as last resort
      const smartResult = await suggestDomainsSmart({
        query: baseName,
        tld: tld,
        style: "short",
        max_suggestions: 10
      });
      return {
        originalTld: tld,
        suggestions: smartResult.results.available,
        message: "Used AI-powered suggestions for creative alternatives"
      };
    }

    // Case 2: All suggestions are premium (expensive)
    const affordable = result.suggestions.filter(s => s.price_first_year < 50);
    const premium = result.suggestions.filter(s => s.price_first_year >= 50);

    if (affordable.length === 0 && premium.length > 0) {
      return {
        suggestions: [],
        premiumOnly: premium,
        message: `Only premium domains available (starting at $${premium[0].price_first_year})`
      };
    }

    return { suggestions: result.suggestions };

  } catch (error) {
    // Handle rate limiting during suggestion generation
    if (error.code === "RATE_LIMIT") {
      await new Promise(r => setTimeout(r, error.retryAfter * 1000));
      return getSuggestionsWithFallback(baseName, tld);
    }
    throw error;
  }
}

// Usage
const suggestions = await getSuggestionsWithFallback("techapp", "com");
if (suggestions.alternativeTld) {
  console.log(suggestions.message);
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

**Error Handling for check_socials:**

```typescript
// Handle various error scenarios when checking social platforms
async function robustSocialCheck(username: string) {
  try {
    const result = await checkSocials({
      name: username,
      platforms: ["github", "twitter", "instagram", "npm", "linkedin"]
    });

    // Categorize results by confidence and availability
    const report = {
      definitelyAvailable: result.results
        .filter(r => r.available && r.confidence === "high")
        .map(r => r.platform),
      probablyAvailable: result.results
        .filter(r => r.available && r.confidence === "medium")
        .map(r => r.platform),
      definitelyTaken: result.results
        .filter(r => !r.available && r.confidence === "high")
        .map(r => r.platform),
      probablyTaken: result.results
        .filter(r => !r.available && r.confidence === "medium")
        .map(r => r.platform),
      checkManually: result.results
        .filter(r => r.confidence === "low")
        .map(r => ({ platform: r.platform, url: r.url })),
      errors: result.results
        .filter(r => r.error)
        .map(r => ({ platform: r.platform, error: r.error }))
    };

    return report;
  } catch (error) {
    // Handle rate limiting
    if (error.code === "RATE_LIMIT") {
      console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
      await new Promise(r => setTimeout(r, error.retryAfter * 1000));
      return robustSocialCheck(username); // Retry
    }

    // Handle network errors
    if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") {
      console.log("Network issue. Some platforms may not have been checked.");
      return { error: "Partial check - network issues", platforms: [] };
    }

    throw error;
  }
}

// Usage
const socialReport = await robustSocialCheck("myproject");
console.log("Secure these now:", socialReport.definitelyAvailable);
console.log("Verify manually:", socialReport.checkManually);
```

**Confidence Levels Explained:**

| Platform | Confidence | Detection Method |
|----------|------------|------------------|
| GitHub | High | Public API check |
| Twitter/X | High | oembed API (v1.2.1+) |
| npm | High | Registry API |
| PyPI | High | Package API |
| Reddit | High | Profile check |
| YouTube | Medium | Channel page check |
| ProductHunt | Medium | Profile page check |
| Instagram | Low | Blocked by platform |
| LinkedIn | Low | Blocked by platform |
| TikTok | Low | Blocked by platform |

## Configuration

### API Keys Setup and Benefits

Domain Search MCP works without API keys using RDAP/WHOIS fallbacks, but configuring registrar API keys provides significant benefits:

#### Performance Comparison: API Keys vs Fallbacks

| Metric | Without API Keys | With Porkbun API | With Namecheap API |
|--------|-----------------|------------------|-------------------|
| **Response Time** | 2-5 seconds | 100-200ms | 150-300ms |
| **Rate Limit** | 10-50 req/min | 1000+ req/min | 500+ req/min |
| **Pricing Data** | Not available | Full pricing | Full pricing |
| **Bulk Operations** | ~50 domains max | 100 domains | 100 domains |
| **Reliability** | Varies by TLD | 99.9% uptime | 99.9% uptime |
| **WHOIS Privacy Info** | No | Yes | Yes |

#### Configuring Porkbun API (Recommended)

```typescript
// Step 1: Get free API keys from https://porkbun.com/account/api

// Step 2: Add to your .env file
PORKBUN_API_KEY=pk1_abc123...
PORKBUN_SECRET_KEY=sk1_xyz789...

// Step 3: The server automatically detects and uses these keys
// No code changes needed - just set environment variables

// Verification: Check if API keys are working
const result = await searchDomain({
  domain_name: "example",
  tlds: ["com"]
});

// With API keys, you'll see:
// - source: "porkbun_api" (not "rdap" or "whois")
// - price_first_year: 8.95 (actual pricing)
// - privacy_included: true (WHOIS privacy info)
```

#### Configuring Namecheap API

```typescript
// Step 1: Enable API access at https://ap.www.namecheap.com/settings/tools/apiaccess
// Step 2: Whitelist your IP address in Namecheap dashboard

// Step 3: Add to your .env file
NAMECHEAP_API_KEY=your_api_key
NAMECHEAP_API_USER=your_username
NAMECHEAP_CLIENT_IP=your_whitelisted_ip  // Optional, auto-detected

// The server uses Namecheap as secondary source after Porkbun
```

#### Registrar Selection Strategy

The server automatically selects the best available source:

```typescript
// Priority order (highest to lowest):
// 1. Porkbun API (if configured) - fastest, most reliable
// 2. Namecheap API (if configured) - good alternative
// 3. GoDaddy MCP (if available) - no API key needed, has pricing
// 4. RDAP (always available) - fast but no pricing
// 5. WHOIS (fallback) - slowest, rate-limited

// Example: How source selection works
const result = await searchDomain({ domain_name: "startup", tlds: ["com"] });

// Result shows which source was used:
console.log(result.results[0].source);
// "porkbun_api" - if Porkbun keys configured
// "namecheap_api" - if only Namecheap configured
// "godaddy_mcp" - if GoDaddy MCP available
// "rdap" - if no API keys, RDAP successful
// "whois" - fallback when RDAP fails
```

#### Handling Missing API Credentials

```typescript
// The server gracefully handles missing credentials
try {
  const result = await searchDomain({
    domain_name: "example",
    tlds: ["com"]
  });

  // Check which source was used
  if (result.results[0].source === "rdap" || result.results[0].source === "whois") {
    console.log("Note: Using fallback. Configure API keys for pricing data.");
  }

  // Check if pricing is available
  if (result.results[0].price_first_year === null) {
    console.log("Pricing not available. Add Porkbun API key for pricing.");
  }
} catch (error) {
  if (error.code === "AUTH_ERROR") {
    console.log("API key invalid. Check your credentials.");
  }
}
```

#### Complete Configuration Example

```typescript
// Full .env configuration for optimal performance
// ================================================

// Required for pricing data (choose at least one)
PORKBUN_API_KEY=pk1_your_key
PORKBUN_SECRET_KEY=sk1_your_secret

// Optional: Additional registrar for price comparison
NAMECHEAP_API_KEY=your_namecheap_key
NAMECHEAP_API_USER=your_username

// Optional: Performance tuning
CACHE_TTL_AVAILABILITY=300    // Cache results for 5 minutes
CACHE_TTL_PRICING=3600        // Cache pricing for 1 hour
RATE_LIMIT_PER_MINUTE=60      // Max requests per minute

// Optional: Logging
LOG_LEVEL=info                // debug | info | warn | error
```

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

#### WHOIS/RDAP Protocol Details

**RDAP (Registration Data Access Protocol):**
- Modern replacement for WHOIS with JSON responses
- Each TLD has its own RDAP server (e.g., rdap.verisign.com for .com)
- Rate limits are per-TLD, not global
- Supports HTTPS with structured responses

```typescript
// RDAP servers by TLD
const rdapServers = {
  "com": "https://rdap.verisign.com/com/v1/domain/",
  "net": "https://rdap.verisign.com/net/v1/domain/",
  "io": "https://rdap.nic.io/domain/",
  "dev": "https://rdap.nic.google/domain/",
  "app": "https://rdap.nic.google/domain/"
};

// RDAP response indicates availability
// - 200 OK: Domain is registered (taken)
// - 404 Not Found: Domain is available
// - 429 Too Many Requests: Rate limited
```

**WHOIS Protocol:**
- Legacy text-based protocol on port 43
- Different servers have different response formats
- Some servers ban IPs after repeated queries
- No standard rate limit headers

```typescript
// WHOIS rate limit strategies
const whoisStrategies = {
  // Spread requests across time
  delayBetweenRequests: 2000,  // 2 seconds minimum

  // Use different query patterns to avoid detection
  randomizeQueryTiming: true,

  // Fallback to RDAP when WHOIS fails
  rdapFallback: true,

  // Cache responses aggressively
  cacheTTL: 300  // 5 minutes
};
```

#### Monitoring WHOIS/RDAP Health

```typescript
// Monitor rate limit status across sources
async function checkSourceHealth() {
  const sources = ["rdap", "whois", "porkbun", "namecheap"];
  const health = {};

  for (const source of sources) {
    try {
      const start = Date.now();
      await searchDomain({ domain_name: "test" + Date.now(), tlds: ["com"] });
      health[source] = {
        status: "healthy",
        latency: Date.now() - start
      };
    } catch (error) {
      health[source] = {
        status: error.code === "RATE_LIMIT" ? "rate_limited" : "error",
        retryAfter: error.retryAfter || null
      };
    }
  }

  return health;
}
```

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

### Workflow 1: Complete Domain Acquisition with Partial Availability Handling

A comprehensive workflow that handles scenarios where domains are available on some registrars but not others, or when some checks succeed while others fail:

```typescript
async function completeDomainAcquisition(brandName: string) {
  // Step 1: Run parallel checks across domains and social media
  const [domainResults, socialResults] = await Promise.all([
    searchDomain({
      domain_name: brandName,
      tlds: ["com", "io", "dev", "app", "co"]
    }),
    checkSocials({
      name: brandName,
      platforms: ["github", "twitter", "instagram", "npm", "linkedin"]
    })
  ]);

  // Step 2: Handle partial availability - some TLDs available, some taken
  const available = domainResults.results.filter(r => r.available && !r.error);
  const taken = domainResults.results.filter(r => !r.available && !r.error);
  const failed = domainResults.results.filter(r => r.error);

  // Step 3: Retry failed checks with exponential backoff
  const retriedResults = [];
  for (const failedDomain of failed) {
    const tld = failedDomain.domain.split('.').pop();
    let delay = 1000;

    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise(r => setTimeout(r, delay));
      try {
        const retry = await searchDomain({
          domain_name: brandName,
          tlds: [tld]
        });
        if (!retry.results[0].error) {
          retriedResults.push(retry.results[0]);
          break;
        }
      } catch (e) {
        delay *= 2; // Exponential backoff
      }
    }
  }

  // Step 4: If preferred .com is taken, generate alternatives
  let suggestions = [];
  const comDomain = [...available, ...retriedResults].find(d => d.domain.endsWith('.com'));
  if (!comDomain) {
    const suggestResult = await suggestDomains({
      base_name: brandName,
      tld: "com",
      max_suggestions: 10,
      variants: ["prefixes", "suffixes", "hyphen"]
    });
    suggestions = suggestResult.suggestions;
  }

  // Step 5: Compare pricing for available domains
  const priceComparisons = await Promise.all(
    available.slice(0, 3).map(d => {
      const [name, tld] = d.domain.split('.');
      return compareRegistrars({ domain: name, tld }).catch(() => null);
    })
  );

  // Step 6: Compile comprehensive report
  return {
    brandName,
    summary: {
      domainsChecked: domainResults.results.length,
      available: available.length + retriedResults.length,
      taken: taken.length,
      failedChecks: failed.length - retriedResults.length,
      socialsAvailable: socialResults.results.filter(r => r.available).length
    },
    domains: {
      available: [...available, ...retriedResults].map(d => ({
        domain: d.domain,
        price: d.price_first_year,
        registrar: d.registrar,
        source: d.source
      })),
      taken: taken.map(d => d.domain),
      alternatives: suggestions.map(s => s.domain)
    },
    socials: {
      available: socialResults.results
        .filter(r => r.available && r.confidence !== "low")
        .map(r => r.platform),
      taken: socialResults.results
        .filter(r => !r.available)
        .map(r => r.platform),
      needsManualCheck: socialResults.results
        .filter(r => r.confidence === "low")
        .map(r => r.platform)
    },
    pricing: priceComparisons.filter(Boolean).map(p => ({
      domain: p.domain,
      bestPrice: p.best_first_year,
      recommendation: p.recommendation
    })),
    nextSteps: generateNextSteps(available, socialResults, suggestions)
  };
}

function generateNextSteps(available, socialResults, suggestions) {
  const steps = [];
  if (available.length > 0) {
    steps.push(`Register ${available[0].domain} at ${available[0].registrar}`);
  } else if (suggestions.length > 0) {
    steps.push(`Consider alternative: ${suggestions[0].domain}`);
  }
  const availableSocials = socialResults.results.filter(r => r.available);
  if (availableSocials.length > 0) {
    steps.push(`Secure username on: ${availableSocials.map(r => r.platform).join(', ')}`);
  }
  return steps;
}

// Usage
const acquisition = await completeDomainAcquisition("techstartup");
// Returns comprehensive report with partial availability handled
```

### Workflow 2: Domain Suggestion When Preferred Name is Taken

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

### Workflow 5: Bulk Validation with Compare and Suggest (100 Domains)

Complete workflow that validates 100 domains using bulk_search, finds best pricing with compare_registrars for available ones, and generates alternatives for unavailable ones using suggest_domains:

```typescript
async function bulkDomainValidationPipeline(domainNames: string[], tld: string = "com") {
  // Step 1: Bulk search all domains (handles up to 100)
  console.log(`Checking ${domainNames.length} domains...`);

  const bulkResults = await bulkSearch({
    domains: domainNames,
    tld: tld,
    concurrency: 10  // Process 10 at a time for optimal speed
  });

  // Step 2: Separate available and unavailable domains
  const available = bulkResults.results.filter(r => r.available && !r.error);
  const unavailable = bulkResults.results.filter(r => !r.available && !r.error);
  const errors = bulkResults.results.filter(r => r.error);

  console.log(`Results: ${available.length} available, ${unavailable.length} taken, ${errors.length} errors`);

  // Step 3: Compare registrar pricing for available domains (top 10)
  const topAvailable = available
    .sort((a, b) => (a.price_first_year || 999) - (b.price_first_year || 999))
    .slice(0, 10);

  const priceComparisons = await Promise.all(
    topAvailable.map(async (domain) => {
      try {
        const name = domain.domain.replace(`.${tld}`, '');
        const comparison = await compareRegistrars({
          domain: name,
          tld: tld,
          registrars: ["porkbun", "namecheap"]
        });
        return { domain: domain.domain, comparison };
      } catch (error) {
        return { domain: domain.domain, comparison: null, error: error.message };
      }
    })
  );

  // Step 4: Generate alternatives for unavailable domains (top 5)
  const topUnavailable = unavailable.slice(0, 5);
  const alternatives = await Promise.all(
    topUnavailable.map(async (domain) => {
      try {
        const name = domain.domain.replace(`.${tld}`, '');
        const suggestions = await suggestDomains({
          base_name: name,
          tld: tld,
          max_suggestions: 5,
          variants: ["prefixes", "suffixes", "hyphen"]
        });
        return {
          originalDomain: domain.domain,
          alternatives: suggestions.suggestions
        };
      } catch (error) {
        return { originalDomain: domain.domain, alternatives: [], error: error.message };
      }
    })
  );

  // Step 5: Compile comprehensive report
  return {
    summary: {
      totalSearched: domainNames.length,
      available: available.length,
      unavailable: unavailable.length,
      errors: errors.length
    },
    availableDomains: available.map(d => ({
      domain: d.domain,
      price: d.price_first_year,
      registrar: d.registrar
    })),
    bestDeals: priceComparisons
      .filter(p => p.comparison)
      .map(p => ({
        domain: p.domain,
        bestFirstYear: p.comparison.best_first_year,
        bestRenewal: p.comparison.best_renewal,
        recommendation: p.comparison.recommendation
      })),
    alternativesForTaken: alternatives.filter(a => a.alternatives.length > 0),
    failedChecks: errors.map(e => ({ domain: e.domain, error: e.error }))
  };
}

// Usage: Validate 50 startup name ideas
const startupNames = [
  "techflow", "datawise", "cloudpeak", "aiforge", "bytecraft",
  "codestream", "devpulse", "syncwave", "logiclab", "pixelcraft",
  // ... add more names up to 100
];

const report = await bulkDomainValidationPipeline(startupNames, "io");
console.log(`Found ${report.summary.available} available domains`);
console.log(`Best deal: ${report.bestDeals[0]?.domain} at $${report.bestDeals[0]?.bestFirstYear?.price}`);
```

### Workflow 6: Domain Research with TLD Info (search + tld_info + suggest)

A research-focused workflow using search_domain, tld_info, and suggest_domains to provide comprehensive domain options analysis:

```typescript
async function domainResearchWithTldAnalysis(baseName: string, preferredTlds: string[] = ["com", "io", "dev"]) {
  // Step 1: Get detailed information about each TLD
  const tldDetails = await Promise.all(
    preferredTlds.map(async (tld) => {
      const info = await tldInfo({ tld, detailed: true });
      return { tld, ...info };
    })
  );

  // Step 2: Search domain availability across all TLDs
  const searchResults = await searchDomain({
    domain_name: baseName,
    tlds: preferredTlds
  });

  // Step 3: For each unavailable TLD, generate suggestions
  const unavailableTlds = searchResults.results
    .filter(r => !r.available)
    .map(r => r.domain.split('.').pop());

  const suggestions = {};
  for (const tld of unavailableTlds) {
    try {
      const result = await suggestDomains({
        base_name: baseName,
        tld: tld,
        max_suggestions: 5,
        variants: ["prefixes", "suffixes"]
      });
      suggestions[tld] = result.suggestions;
    } catch (error) {
      suggestions[tld] = [];
    }
  }

  // Step 4: Compile research report with TLD context
  return {
    baseName,
    tldAnalysis: tldDetails.map(tld => ({
      tld: tld.tld,
      description: tld.description,
      typicalUse: tld.typical_use,
      priceRange: tld.price_range,
      restrictions: tld.restrictions || [],
      popularity: tld.popularity,
      recommendation: tld.recommendation
    })),
    availability: searchResults.results.map(r => ({
      domain: r.domain,
      available: r.available,
      price: r.price_first_year,
      tldInfo: tldDetails.find(t => r.domain.endsWith(`.${t.tld}`))
    })),
    suggestions: Object.entries(suggestions).map(([tld, suggs]) => ({
      forTld: tld,
      alternatives: suggs.map(s => s.domain)
    })),
    recommendation: generateTldRecommendation(searchResults.results, tldDetails)
  };
}

function generateTldRecommendation(results, tldDetails) {
  const available = results.filter(r => r.available);
  if (available.length === 0) {
    return "No preferred TLDs available. Consider the suggested alternatives.";
  }

  const cheapest = available.sort((a, b) => a.price_first_year - b.price_first_year)[0];
  const tldInfo = tldDetails.find(t => cheapest.domain.endsWith(`.${t.tld}`));

  return `Recommended: ${cheapest.domain} ($${cheapest.price_first_year}/yr) - ${tldInfo?.recommendation || 'Good choice'}`;
}

// Usage
const research = await domainResearchWithTldAnalysis("myproject", ["com", "io", "dev", "app"]);
console.log(research.recommendation);
// Output: "Recommended: myproject.com ($8.95/yr) - Classic, universal choice"
```

### Workflow 7: Validate 50 Domains with Result Aggregation

End-to-end workflow for validating exactly 50 domain names with comprehensive result handling:

```typescript
async function validate50Domains(domainNames: string[], tld: string = "com") {
  // Ensure we have exactly 50 domains
  const domains = domainNames.slice(0, 50);
  if (domains.length < 50) {
    console.log(`Note: Only ${domains.length} domains provided`);
  }

  console.log(`Starting validation of ${domains.length} domains...`);
  const startTime = Date.now();

  // Step 1: Bulk search with optimized concurrency
  const bulkResult = await bulkSearch({
    domains: domains,
    tld: tld,
    concurrency: 10  // Optimal for rate limit avoidance
  });

  // Step 2: Aggregate results by status
  const aggregation = {
    available: [],
    taken: [],
    errors: [],
    bySource: {},
    byPrice: { under10: [], under25: [], under50: [], premium: [] }
  };

  for (const result of bulkResult.results) {
    // Categorize by availability
    if (result.error) {
      aggregation.errors.push({
        domain: result.domain,
        error: result.error,
        retryable: result.retryable || false
      });
    } else if (result.available) {
      aggregation.available.push(result);

      // Categorize by price
      const price = result.price_first_year;
      if (price && price < 10) aggregation.byPrice.under10.push(result);
      else if (price && price < 25) aggregation.byPrice.under25.push(result);
      else if (price && price < 50) aggregation.byPrice.under50.push(result);
      else if (price) aggregation.byPrice.premium.push(result);
    } else {
      aggregation.taken.push(result);
    }

    // Track by source
    const source = result.source || "unknown";
    if (!aggregation.bySource[source]) {
      aggregation.bySource[source] = { count: 0, avgLatency: 0 };
    }
    aggregation.bySource[source].count++;
  }

  // Step 3: Retry failed domains with exponential backoff
  if (aggregation.errors.length > 0) {
    console.log(`Retrying ${aggregation.errors.length} failed domains...`);

    const retryResults = [];
    for (const failed of aggregation.errors.filter(e => e.retryable)) {
      const domainName = failed.domain.replace(`.${tld}`, '');
      let delay = 2000;

      for (let attempt = 1; attempt <= 3; attempt++) {
        await new Promise(r => setTimeout(r, delay));
        try {
          const retry = await searchDomain({
            domain_name: domainName,
            tlds: [tld]
          });
          if (!retry.results[0].error) {
            retryResults.push(retry.results[0]);
            // Remove from errors, add to appropriate category
            const idx = aggregation.errors.findIndex(e => e.domain === failed.domain);
            if (idx > -1) aggregation.errors.splice(idx, 1);
            if (retry.results[0].available) {
              aggregation.available.push(retry.results[0]);
            } else {
              aggregation.taken.push(retry.results[0]);
            }
            break;
          }
        } catch (e) {
          delay *= 2;
        }
      }
    }
  }

  // Step 4: Generate summary report
  const duration = Date.now() - startTime;
  const report = {
    summary: {
      totalDomains: domains.length,
      available: aggregation.available.length,
      taken: aggregation.taken.length,
      errors: aggregation.errors.length,
      duration: `${(duration / 1000).toFixed(1)}s`,
      avgTimePerDomain: `${(duration / domains.length).toFixed(0)}ms`
    },
    availableDomains: aggregation.available
      .sort((a, b) => (a.price_first_year || 999) - (b.price_first_year || 999))
      .map(d => ({
        domain: d.domain,
        price: d.price_first_year,
        registrar: d.registrar,
        source: d.source
      })),
    priceBreakdown: {
      budget: aggregation.byPrice.under10.map(d => d.domain),
      moderate: aggregation.byPrice.under25.map(d => d.domain),
      standard: aggregation.byPrice.under50.map(d => d.domain),
      premium: aggregation.byPrice.premium.map(d => d.domain)
    },
    sourceStats: aggregation.bySource,
    takenDomains: aggregation.taken.map(d => d.domain),
    failedChecks: aggregation.errors
  };

  return report;
}

// Usage: Validate 50 startup name ideas
const startupIdeas = [
  "codeforge", "devpulse", "techwave", "dataflow", "cloudpeak",
  "aibridge", "synclab", "bytecraft", "logicbox", "pixelsmith",
  "neuralnet", "quantumbit", "cyberlink", "smartnode", "deepcore",
  "faststack", "cleancode", "agiledev", "swiftbyte", "codestream",
  "datawise", "techspark", "cloudsync", "aistack", "devforge",
  "bytewise", "logicflow", "pixelwave", "neuralhub", "quantumai",
  "cyberpulse", "smartflow", "deeptech", "fastcode", "cleanstack",
  "agilebit", "swiftdev", "streamcode", "wisebyte", "sparktech",
  "syncwave", "forgeai", "pulsedev", "wavetech", "flowdata",
  "peakcloud", "bridgeai", "labsync", "craftbyte", "boxlogic"
];

const report = await validate50Domains(startupIdeas, "io");

console.log(`\n=== 50 DOMAIN VALIDATION REPORT ===`);
console.log(`Completed in ${report.summary.duration}`);
console.log(`Available: ${report.summary.available} | Taken: ${report.summary.taken} | Errors: ${report.summary.errors}`);
console.log(`\nBest deals (under $10):`);
report.priceBreakdown.budget.forEach(d => console.log(`  ${d}`));
console.log(`\nTop 5 available domains:`);
report.availableDomains.slice(0, 5).forEach(d =>
  console.log(`  ${d.domain} - $${d.price}/yr (${d.registrar})`)
);
```

### Workflow 8: Domain Research Pipeline

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
