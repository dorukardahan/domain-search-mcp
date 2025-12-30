# Configuration Guide

Detailed setup and configuration for Domain Search MCP.

## Pricing Backend (Recommended)

The MCP does not ship registrar secrets. Pricing is retrieved from a backend you control.

```bash
# .env
PRICING_API_BASE_URL=https://your-backend.example.com
PRICING_API_TOKEN=optional_bearer_token
PRICING_API_TIMEOUT_MS=2500
PRICING_API_MAX_QUOTES_SEARCH=0
PRICING_API_MAX_QUOTES_BULK=0
PRICING_API_CONCURRENCY=4
```

### Optional BYOK (Local)

These are only used if `PRICING_API_BASE_URL` is not set.

**Porkbun**
1. https://porkbun.com/account/api
2. Create API Key + Secret

```bash
PORKBUN_API_KEY=pk1_your_api_key_here
PORKBUN_API_SECRET=sk1_your_secret_key_here
```

**Namecheap (IP whitelist required)**
1. https://ap.www.namecheap.com/settings/tools/apiaccess
2. Enable API access + whitelist IP

```bash
NAMECHEAP_API_KEY=your_api_key
NAMECHEAP_API_USER=your_username
NAMECHEAP_CLIENT_IP=your_ip_address
```

## Data Source Priority

The server automatically selects the best available source:

1. **Pricing API** - If configured (pricing + premium flags)
2. **Porkbun/Namecheap (BYOK)** - Only when Pricing API is not set
3. **RDAP** - Primary availability source (fast, no pricing)
4. **WHOIS** - Last resort (slow)
5. **GoDaddy public endpoint** - Premium/auction signals in `search_domain` only

## Aftermarket Signals

The MCP can flag taken domains that appear in the Sedo public auctions feed.
This is a best-effort signal and should be verified at the marketplace link.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PRICING_API_BASE_URL` | - | Pricing backend base URL |
| `PRICING_API_TOKEN` | - | Optional bearer token |
| `PRICING_API_TIMEOUT_MS` | 2500 | Backend request timeout |
| `PRICING_API_MAX_QUOTES_SEARCH` | 0 | Max pricing calls per search (0 = unlimited) |
| `PRICING_API_MAX_QUOTES_BULK` | 0 | Max pricing calls per bulk search (0 = unlimited) |
| `PRICING_API_CONCURRENCY` | 4 | Pricing request concurrency |
| `PORKBUN_API_KEY` | - | Porkbun API key |
| `PORKBUN_API_SECRET` | - | Porkbun API secret |
| `NAMECHEAP_API_KEY` | - | Namecheap API key |
| `NAMECHEAP_API_USER` | - | Namecheap username |
| `NAMECHEAP_CLIENT_IP` | - | Whitelisted IP |
| `OUTPUT_FORMAT` | table | `table`, `json`, or `both` for tool output formatting |
| `LOG_LEVEL` | info | Logging level |
| `CACHE_TTL_AVAILABILITY` | 60 | Cache TTL (seconds) for available results (taken results use ~2x) |
| `CACHE_TTL_PRICING` | 3600 | Pricing cache TTL |
| `CACHE_TTL_SEDO` | 3600 | Sedo auctions feed cache TTL |
| `CACHE_TTL_AFTERMARKET_NS` | 300 | Nameserver lookup cache TTL |
| `SEDO_FEED_ENABLED` | true | Enable Sedo feed lookup for aftermarket hints |
| `SEDO_FEED_URL` | https://sedo.com/txt/auctions_us.txt | Sedo public feed URL |
| `AFTERMARKET_NS_ENABLED` | true | Enable nameserver-based aftermarket hints |
| `AFTERMARKET_NS_TIMEOUT_MS` | 1500 | Nameserver lookup timeout |

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

Pricing calls are attempted for every available domain by default. Set `PRICING_API_MAX_QUOTES_*`
to a positive integer to cap per-request pricing calls (0 = unlimited).
Availability uses RDAP/WHOIS locally to avoid central bottlenecks.

## Caching

Results are cached in memory:

- Availability: 60s (taken results ~120s)
- Pricing: 1 hour
- Sedo auctions feed: 1 hour
- Nameserver lookup: 5 minutes
- TLD info: 24 hours

Configure via environment:

```bash
CACHE_TTL_AVAILABILITY=60  # seconds
CACHE_TTL_PRICING=3600
CACHE_TTL_SEDO=3600
CACHE_TTL_AFTERMARKET_NS=300
```

## Verifying Setup

Check if pricing is working:

```typescript
const result = await searchDomain({
  domain_name: "test-" + Date.now(),
  tlds: ["com"]
});

console.log("Pricing status:", result.results[0].pricing_status);
console.log("Pricing source:", result.results[0].pricing_source);
// "ok" + "pricing_api" = backend working
// "not_configured" = PRICING_API_BASE_URL not set
```

## Troubleshooting

### "No pricing data"

Pricing backend not configured (set `PRICING_API_BASE_URL`) or pricing is rate-limited.

### "Rate limit exceeded"

Too many requests. Either:
- Wait and retry
- Configure API keys for higher limits

### "Connection refused"

Network issue or service down. The server will fallback to other sources automatically.

### "AUTH_ERROR"

Invalid API credentials. Verify your keys are correct.
