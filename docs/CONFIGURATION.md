# Configuration Guide

Detailed setup and configuration for Domain Search MCP.

## API Keys Setup

### Porkbun (Recommended)

Free, fast, no restrictions.

1. Go to https://porkbun.com/account/api
2. Create account (no credit card required)
3. Click "Create API Key"
4. Save both keys

```bash
# .env
PORKBUN_API_KEY=pk1_your_api_key_here
PORKBUN_API_SECRET=sk1_your_secret_key_here
```

### Namecheap (Optional)

Requires IP whitelist.

1. Go to https://ap.www.namecheap.com/settings/tools/apiaccess
2. Enable API Access
3. Whitelist your IP
4. Copy credentials

```bash
# .env
NAMECHEAP_API_KEY=your_api_key
NAMECHEAP_API_USER=your_username
NAMECHEAP_CLIENT_IP=your_ip_address
```

## Data Source Priority

The server automatically selects the best available source:

1. **Porkbun API** - If configured (fastest, with pricing)
2. **Namecheap API** - If configured
3. **GoDaddy MCP** - Always available (no auth needed)
4. **RDAP** - Fallback (fast, no pricing)
5. **WHOIS** - Last resort (slow)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORKBUN_API_KEY` | - | Porkbun API key |
| `PORKBUN_API_SECRET` | - | Porkbun API secret |
| `NAMECHEAP_API_KEY` | - | Namecheap API key |
| `NAMECHEAP_API_USER` | - | Namecheap username |
| `NAMECHEAP_CLIENT_IP` | - | Whitelisted IP |
| `LOG_LEVEL` | info | Logging level |
| `CACHE_TTL_AVAILABILITY` | 300 | Cache TTL (seconds) |
| `CACHE_TTL_PRICING` | 3600 | Pricing cache TTL |

## Claude Desktop Setup

### macOS

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "domain-search": {
      "command": "node",
      "args": ["/path/to/domain-search-mcp/dist/server.js"]
    }
  }
}
```

### Windows

```json
// %APPDATA%\Claude\claude_desktop_config.json
{
  "mcpServers": {
    "domain-search": {
      "command": "node",
      "args": ["C:\\path\\to\\domain-search-mcp\\dist\\server.js"]
    }
  }
}
```

### With Environment Variables

```json
{
  "mcpServers": {
    "domain-search": {
      "command": "node",
      "args": ["/path/to/domain-search-mcp/dist/server.js"],
      "env": {
        "PORKBUN_API_KEY": "pk1_xxx",
        "PORKBUN_API_SECRET": "sk1_xxx"
      }
    }
  }
}
```

## VS Code Setup

Add to `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "domain-search": {
      "command": "node",
      "args": ["./dist/server.js"],
      "cwd": "/path/to/domain-search-mcp"
    }
  }
}
```

## Rate Limits

### With API Keys

| Source | Requests/min | Response Time |
|--------|-------------|---------------|
| Porkbun | 1000+ | 100-200ms |
| Namecheap | 500+ | 150-300ms |

### Without API Keys

| Source | Requests/min | Response Time |
|--------|-------------|---------------|
| RDAP | 30-50 | 50-200ms |
| WHOIS | 5-20 | 500-2000ms |

The server handles rate limits automatically with exponential backoff.

## Caching

Results are cached in memory:

- Availability: 5 minutes
- Pricing: 1 hour
- TLD info: 24 hours

Configure via environment:

```bash
CACHE_TTL_AVAILABILITY=300  # seconds
CACHE_TTL_PRICING=3600
```

## Verifying Setup

Check if API keys are working:

```typescript
const result = await searchDomain({
  domain_name: "test-" + Date.now(),
  tlds: ["com"]
});

console.log("Source:", result.results[0].source);
// "porkbun_api" = API keys working
// "rdap" or "whois" = falling back (no API keys)
```

## Troubleshooting

### "No pricing data"

API keys not configured. Add Porkbun keys to .env.

### "Rate limit exceeded"

Too many requests. Either:
- Wait and retry
- Configure API keys for higher limits

### "Connection refused"

Network issue or service down. The server will fallback to other sources automatically.

### "AUTH_ERROR"

Invalid API credentials. Verify your keys are correct.
