# Domain Search MCP

<a href="https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp/badge" alt="Domain Search MCP on Glama" />
</a>

Fast domain availability aggregator for AI assistants. Check domain availability across Porkbun, Namecheap, RDAP, and WHOIS. Compare pricing. Get suggestions.

Built with the [Model Context Protocol (MCP)](https://anthropic.com/model-context-protocol) for seamless integration with Claude Desktop, Cursor, Cline, and other AI tools.

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

Open Claude Desktop and ask:

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

### 6 Powerful Tools

| Tool | What it does |
|------|--------------|
| **search_domain** | Check availability across multiple TLDs with pricing |
| **bulk_search** | Check up to 100 domains at once |
| **compare_registrars** | Find the best price across registrars |
| **suggest_domains** | Get available variations when your name is taken |
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

Verify username availability:

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
    { "platform": "twitter", "available": false, "confidence": "medium" },
    { "platform": "instagram", "available": true, "confidence": "low" }
  ],
  "insights": [
    "✅ vibecoding is available on: github",
    "❌ vibecoding is taken on: twitter",
    "⚠️ Could not reliably check: instagram (check manually)"
  ]
}
```

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
│   │   ├── tld_info.ts
│   │   └── check_socials.ts
│   ├── registrars/         # Registrar adapters
│   │   ├── base.ts
│   │   ├── porkbun.ts
│   │   └── namecheap.ts
│   ├── fallbacks/          # RDAP and WHOIS fallbacks
│   │   ├── rdap.ts
│   │   └── whois.ts
│   ├── services/           # Business logic
│   │   └── domain-search.ts
│   └── utils/              # Utilities
│       ├── logger.ts
│       ├── cache.ts
│       ├── errors.ts
│       └── validators.ts
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
