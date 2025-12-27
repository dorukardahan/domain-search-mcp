# Domain Search MCP

Fast domain availability checker for AI assistants. Check domains across Porkbun, Namecheap, GoDaddy, RDAP, and WHOIS. Compare pricing. Get AI-powered suggestions.

<a href="https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp/badge" alt="Domain Search MCP" />
</a>

## Quick Start

### Install

```bash
git clone https://github.com/dorukardahan/domain-search-mcp.git
cd domain-search-mcp
npm install && npm run build
```

### Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Try It

Ask Claude: *"Check if vibecoding is available as a domain"*

```
vibecoding.com - Available - $8.95/year
vibecoding.io  - Available - $29.88/year
vibecoding.dev - Available - $10.18/year
```

## Tools

### search_domain

Check domain availability across multiple TLDs with pricing.

```typescript
const result = await searchDomain({
  domain_name: "myproject",
  tlds: ["com", "io", "dev"]
});

// Returns: availability, pricing, registrar info for each TLD
```

**Parameters:**
- `domain_name` (required): Domain name without TLD
- `tlds`: TLDs to check (default: `["com", "io", "dev"]`)

### bulk_search

Check up to 100 domains at once.

```typescript
const result = await bulkSearch({
  domains: ["startup1", "startup2", "startup3"],
  tld: "com"
});

// Returns: { available: 2, taken: 1, results: [...] }
```

### compare_registrars

Find the best price across registrars.

```typescript
const result = await compareRegistrars({
  domain: "myproject",
  tld: "com"
});

// Returns: pricing comparison, recommendation
```

### suggest_domains

Generate alternatives when your preferred name is taken.

```typescript
const result = await suggestDomains({
  base_name: "techapp",  // taken
  tld: "com",
  variants: ["prefixes", "suffixes", "hyphen"]
});

// Returns: gettechapp.com, techapphq.com, tech-app.com...
```

### suggest_domains_smart

AI-powered suggestions from keywords or descriptions.

```typescript
const result = await suggestDomainsSmart({
  query: "ai customer service startup",
  tld: "com",
  style: "brandable"
});

// Returns: creative, brandable domain suggestions
```

### tld_info

Get TLD information, restrictions, and pricing.

```typescript
const result = await tldInfo({ tld: "io" });

// Returns: description, typical price, restrictions
```

### check_socials

Check username availability on social platforms.

```typescript
const result = await checkSocials({
  name: "mybrand",
  platforms: ["github", "twitter", "instagram"]
});

// Returns: availability status per platform
```

## Configuration

### Works Without API Keys

The server works out of the box using RDAP/WHOIS fallbacks. For faster responses and pricing data, add API keys:

```bash
# .env file
PORKBUN_API_KEY=pk1_xxx      # Get free at porkbun.com/account/api
PORKBUN_API_SECRET=sk1_xxx
```

### Data Sources

| Source | Speed | Pricing | Auth Required |
|--------|-------|---------|---------------|
| Porkbun API | Fast | Yes | API key |
| Namecheap API | Fast | Yes | API key + IP whitelist |
| GoDaddy public endpoint | Medium | No | None |
| RDAP | Medium | No | None |
| WHOIS | Slow | No | None |

## Error Handling

The server returns structured errors:

```json
{
  "error": true,
  "code": "RATE_LIMIT",
  "message": "Too many requests",
  "retryable": true,
  "suggestedAction": "Wait 30 seconds"
}
```

| Code | Description | Retryable |
|------|-------------|-----------|
| `INVALID_DOMAIN` | Invalid domain format | No |
| `RATE_LIMIT` | Too many requests | Yes |
| `TIMEOUT` | Request timed out | Yes |
| `NO_SOURCE_AVAILABLE` | All sources failed | Yes |

## Rate Limiting

Without API keys, WHOIS/RDAP have strict limits (10-50 req/min). The server handles this automatically with exponential backoff and source fallback.

For high-volume searches, configure Porkbun API keys (1000+ req/min).

## Documentation

- [API Reference](docs/API.md) - Complete API documentation
- [Workflows](docs/WORKFLOWS.md) - Common usage patterns
- [Configuration](docs/CONFIGURATION.md) - Detailed setup guide

## Development

```bash
npm run dev      # Watch mode
npm test         # Run tests
npm run build    # Build for production
```

## License

MIT - See [LICENSE](LICENSE)

## Links

- [GitHub](https://github.com/dorukardahan/domain-search-mcp)
- [npm](https://www.npmjs.com/package/domain-search-mcp)
- [Issues](https://github.com/dorukardahan/domain-search-mcp/issues)
