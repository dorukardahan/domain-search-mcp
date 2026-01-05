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

## Redis Distributed Cache (Optional)

For horizontal scaling across multiple MCP instances, configure Redis:

```bash
# .env
REDIS_URL=redis://:password@host:6379
```

Without Redis, the server uses in-memory caching (works fine for single instances).

### How It Works

The server uses a hybrid cache architecture:

1. **Redis Primary**: When configured, Redis is the primary cache
2. **In-Memory Fallback**: If Redis connection fails, automatically falls back to in-memory
3. **Circuit Breaker**: Redis failures are tracked; after 3 consecutive failures, circuit opens and uses in-memory for 30 seconds before retrying

### Benefits

- Shared cache across multiple server instances
- Persistent cache surviving restarts
- Better cache hit rates in load-balanced deployments
- No single point of failure (graceful degradation)

---

## AI Inference Configuration

AI-powered suggestions (`suggest_domains_smart`) work out of the box using our public VPS running fine-tuned Qwen 7B-DPO. No API keys needed!

### Default (Zero-Config)

Nothing to configure - just use the tool.

### Self-Hosted Setup

For custom AI inference:

```bash
# .env
QWEN_INFERENCE_ENDPOINT=http://your-server:8000
QWEN_API_KEY=optional_if_secured
QWEN_TIMEOUT_MS=15000
QWEN_MAX_RETRIES=2
```

### Fallback: Together.ai (Legacy)

For users with existing Together.ai API keys:

```bash
TOGETHER_API_KEY=your_api_key
TOGETHER_TIMEOUT_MS=30000
TOGETHER_MAX_RETRIES=2
TOGETHER_DEFAULT_MODEL=qwen3-14b-instruct
```

### Inference Priority

1. **VPS Qwen 7B-DPO** (default, zero-config)
2. **Together.ai** (if `TOGETHER_API_KEY` set and VPS fails)
3. **Semantic Engine** (offline fallback, always available)

---

## HTTP Transport Configuration

For ChatGPT Actions, web clients, and REST API access:

```bash
# .env
MCP_TRANSPORT=http
MCP_PORT=3000
MCP_HOST=0.0.0.0
CORS_ORIGINS=*
```

Or use the `--http` flag:

```bash
npx -y domain-search-mcp@latest --http
```

### Endpoints

| Path | Description |
|------|-------------|
| `/` | Server info |
| `/health` | Health check (bypasses rate limit) |
| `/openapi.json` | OpenAPI 3.1 spec |
| `/metrics` | Prometheus metrics |
| `/mcp` | MCP protocol (POST = messages, GET = SSE) |
| `/api/tools/*` | REST API for each tool |

---

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
| `REDIS_URL` | - | Redis connection URL for distributed caching |
| `QWEN_INFERENCE_ENDPOINT` | (public VPS) | Override AI inference endpoint |
| `QWEN_TIMEOUT_MS` | 15000 | AI inference request timeout |
| `QWEN_MAX_RETRIES` | 2 | Retry count for AI inference failures |
| `TOGETHER_API_KEY` | - | Together.ai API key (legacy fallback) |
| `MCP_TRANSPORT` | stdio | Transport mode: `stdio` or `http` |
| `MCP_PORT` | 3000 | HTTP server port |
| `MCP_HOST` | 0.0.0.0 | HTTP server bind address |
| `CORS_ORIGINS` | * | Allowed CORS origins (comma-separated) |

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

Results are cached (Redis if configured, otherwise in-memory):

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
