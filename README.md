# Domain Search MCP

[![npm](https://img.shields.io/npm/v/domain-search-mcp?label=npm)](https://www.npmjs.com/package/domain-search-mcp)
[![downloads](https://img.shields.io/npm/dm/domain-search-mcp?label=downloads)](https://www.npmjs.com/package/domain-search-mcp)
[![license](https://img.shields.io/npm/l/domain-search-mcp)](LICENSE)
[![node](https://img.shields.io/node/v/domain-search-mcp?label=node)](https://www.npmjs.com/package/domain-search-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-2b6cb0)](https://registry.modelcontextprotocol.io)
[![Glama](https://img.shields.io/badge/Glama-Server-0ea5e9)](https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp)
[![Context7](https://img.shields.io/badge/Context7-Indexed-16a34a)](https://context7.com/dorukardahan/domain-search-mcp)

Fast, local-first domain availability checks for MCP clients. Works with zero configuration using public RDAP/WHOIS, and optionally enriches results with registrar pricing via a backend you control.

**🆕 v1.10.0**: GoDaddy public endpoint integration! Enhanced fallback chain (RDAP → GoDaddy → WHOIS) with premium/auction domain detection. Circuit breaker pattern ensures resilience.

**🤖 v1.9.0+**: AI-powered domain suggestions work out of the box! No API keys needed - `suggest_domains_smart` uses our public fine-tuned Qwen 7B-DPO model. Plus: Redis distributed caching and `/metrics` endpoint for observability.

Built on the [Model Context Protocol](https://modelcontextprotocol.io) for Claude, Codex, VS Code, Cursor, Cline, and other MCP-compatible clients.

## Features

| Feature | Description |
|---------|-------------|
| 🔍 **Multi-TLD Search** | Check one name across .com, .io, .dev, .ai and 500+ TLDs |
| 📦 **Bulk Check** | Validate up to 100 domain names in a single call |
| 💎 **Premium Detection** | Identify premium and auction domains via GoDaddy |
| 🤖 **AI Suggestions** | Generate brandable names with fine-tuned Qwen 7B-DPO |
| 💰 **Price Comparison** | Compare pricing across Porkbun, Namecheap |
| 🌐 **Social Handle Check** | Verify username availability on GitHub, Twitter, etc. |
| 🔌 **Dual Transport** | Works via stdio (Claude) or HTTP/SSE (ChatGPT Actions) |
| ⚡ **Zero Config** | Works instantly - no API keys required for availability |

## What It Does

- Check a single name across multiple TLDs.
- Bulk-check up to 100 names for one TLD.
- Compare registrar pricing (uses backend when configured).
- Suggest names and validate social handles.
- Detect premium/auction signals for `search_domain`.

## How It Works

Availability and pricing are intentionally separated:

```
Availability Chain (zero-config):
┌─────────┐     ┌─────────┐     ┌─────────┐
│  RDAP   │ ──► │ GoDaddy │ ──► │  WHOIS  │
│ (fast)  │     │(premium)│     │(fallback│
└─────────┘     └─────────┘     └─────────┘
```

- **Availability** (default, no keys needed):
  - **RDAP**: Primary source - fast, unlimited, public registry data
  - **GoDaddy**: Secondary - adds premium/auction detection (30 req/min, circuit breaker protected)
  - **WHOIS**: Last resort fallback for edge cases
- **Pricing** (optional):
  - Recommended: `PRICING_API_BASE_URL` (backend with Porkbun keys)
  - Optional BYOK: Porkbun/Namecheap only when backend is not configured

This keeps the server zero-config while letting power users enable pricing.

## Pricing Verification

Responses include `price_check_url` (registrar checkout/search link) and may include
`price_note` when a price is estimated. Always verify the final price on the registrar
checkout page before purchase.

If an auction/premium signal is detected, results include an `aftermarket` block with
links to marketplace pages when available. Taken domains may include Sedo auction
hints (public feed) and nameserver-based marketplace hints (Sedo/Dan/Afternic).

## Quick Start

### Option 1: npx (Recommended)

No installation needed - run directly:

```bash
npx -y domain-search-mcp@latest
```

### Option 2: From Source

```bash
git clone https://github.com/dorukardahan/domain-search-mcp.git
cd domain-search-mcp
npm install
npm run build
npm start
```

## Transport Options

### stdio (Default)

For MCP clients like Claude Desktop, Cursor, VS Code - uses stdin/stdout:

```bash
npx -y domain-search-mcp@latest
```

### HTTP/SSE (ChatGPT, Web Clients, LM Studio)

For ChatGPT Actions, web apps, and REST API clients:

```bash
# Start HTTP server on port 3000
npx -y domain-search-mcp@latest --http

# Or with custom port
MCP_PORT=8080 npx -y domain-search-mcp@latest --http
```

**Endpoints:**
- `/mcp` - MCP protocol (POST for messages, GET for SSE stream)
- `/api/tools/*` - REST API for each tool (ChatGPT Actions compatible)
- `/openapi.json` - OpenAPI 3.1 specification
- `/health` - Health check
- `/metrics` - Prometheus-compatible metrics (cache stats, request counts, AI inference health)

### ChatGPT Custom GPT Integration

1. Start the HTTP server (see above)
2. Expose via ngrok: `ngrok http 3000`
3. In ChatGPT, create a Custom GPT and add an Action
4. Import the OpenAPI spec from `https://your-ngrok-url.ngrok-free.dev/openapi.json`
5. Test the tools!

For production deployment, use a permanent domain with SSL instead of ngrok.

**REST API Example:**
```bash
curl -X POST https://your-domain/api/tools/search_domain \
  -H "Content-Type: application/json" \
  -d '{"domain_name":"vibecoding"}'
```

## MCP Client Config

**Claude Code** (`.mcp.json` in project root):
```json
{
  "mcpServers": {
    "domain-search": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "domain-search-mcp@latest"]
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "domain-search": {
      "command": "npx",
      "args": ["-y", "domain-search-mcp@latest"]
    }
  }
}
```

> **💡 Tip**: Always use `@latest` to ensure you're running the newest version with all features.

## Tools

### Core Search
- `search_domain`: Check a name across multiple TLDs, adds premium/auction signals.
- `bulk_search`: Check up to 100 names for a single TLD.
- `compare_registrars`: Compare pricing across registrars (backend when configured).

### AI-Powered Suggestions
- `suggest_domains`: Generate variations (prefix/suffix/hyphen).
- `suggest_domains_smart`: **🤖 AI-powered** brandable name generation using fine-tuned Qwen 7B-DPO. Zero-config - works instantly!
- `analyze_project`: Scan local project or GitHub repo to extract context and suggest matching domain names.

### Domain Investment
- `hunt_domains`: Find valuable domains for investment - scans Sedo auctions, generates patterns, calculates investment scores.
- `expiring_domains`: Monitor domains approaching expiration (requires federated negative cache).

### Utilities
- `tld_info`: TLD metadata and restrictions.
- `check_socials`: Username availability across platforms.
- `ai_health`: Check status of AI inference services (VPS Qwen, circuit breakers, adaptive concurrency).

## Configuration

### Pricing Backend (Recommended)

Set a backend URL that owns registrar keys (Porkbun). The MCP will call
`/api/quote` and `/api/compare` on that backend for pricing.

```bash
PRICING_API_BASE_URL=https://your-backend.example.com
PRICING_API_TOKEN=optional_bearer_token
```

### Optional BYOK (Local)

Used only if `PRICING_API_BASE_URL` is not set.

- Porkbun keys:
  - https://porkbun.com/account/api
  - https://porkbun.com/api/json/v3/documentation
- Namecheap keys (IP whitelist required):
  - https://ap.www.namecheap.com/settings/tools/apiaccess/
  - https://www.namecheap.com/support/api/intro/

```bash
PORKBUN_API_KEY=pk1_your_api_key
PORKBUN_API_SECRET=sk1_your_secret
NAMECHEAP_API_KEY=your_api_key
NAMECHEAP_API_USER=your_username
NAMECHEAP_CLIENT_IP=your_whitelisted_ip
```

### Redis Distributed Cache (Optional)

For horizontal scaling across multiple MCP instances, configure Redis:

```bash
REDIS_URL=redis://:password@host:6379
```

Without Redis, the server uses in-memory caching (works fine for single instances). Redis enables:
- Shared cache across multiple server instances
- Persistent cache surviving restarts
- Better cache hit rates in load-balanced deployments

### AI Inference (Zero-Config)

AI-powered suggestions (`suggest_domains_smart`) work out of the box using our public VPS running fine-tuned Qwen 7B-DPO. No API keys needed!

For self-hosted setups, override the endpoint:
```bash
QWEN_INFERENCE_ENDPOINT=http://your-server:8000
QWEN_API_KEY=optional_if_secured
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | stdio | Transport mode: `stdio` or `http` |
| `MCP_PORT` | 3000 | HTTP server port (when using HTTP transport) |
| `MCP_HOST` | 0.0.0.0 | HTTP server bind address |
| `CORS_ORIGINS` | * | Allowed CORS origins (comma-separated) |
| `PRICING_API_BASE_URL` | - | Pricing backend base URL |
| `PRICING_API_TOKEN` | - | Optional bearer token |
| `PRICING_API_TIMEOUT_MS` | 2500 | Backend request timeout |
| `PRICING_API_MAX_QUOTES_SEARCH` | 0 | Max pricing calls per search (0 = unlimited; backend rate limits apply) |
| `PRICING_API_MAX_QUOTES_BULK` | 0 | Max pricing calls per bulk search (0 = unlimited; backend rate limits apply) |
| `PRICING_API_CONCURRENCY` | 4 | Pricing request concurrency |
| `PORKBUN_API_KEY` | - | Porkbun API key |
| `PORKBUN_API_SECRET` | - | Porkbun API secret |
| `NAMECHEAP_API_KEY` | - | Namecheap API key |
| `NAMECHEAP_API_USER` | - | Namecheap username |
| `NAMECHEAP_CLIENT_IP` | - | Namecheap IP whitelist |
| `OUTPUT_FORMAT` | table | `table`, `json`, or `both` for tool output formatting |
| `LOG_LEVEL` | info | Logging level |
| `CACHE_TTL_AVAILABILITY` | 60 | Availability cache TTL (seconds) |
| `CACHE_TTL_PRICING` | 3600 | Pricing cache TTL (seconds) |
| `CACHE_TTL_SEDO` | 3600 | Sedo auctions feed cache TTL (seconds) |
| `CACHE_TTL_AFTERMARKET_NS` | 300 | Nameserver lookup cache TTL (seconds) |
| `SEDO_FEED_ENABLED` | true | Enable Sedo feed lookup for aftermarket hints |
| `SEDO_FEED_URL` | https://sedo.com/txt/auctions_us.txt | Sedo public feed URL |
| `AFTERMARKET_NS_ENABLED` | true | Enable nameserver-based aftermarket hints |
| `AFTERMARKET_NS_TIMEOUT_MS` | 1500 | Nameserver lookup timeout (ms) |
| `REDIS_URL` | - | Redis connection URL for distributed caching (e.g., `redis://:password@host:6379`) |
| `QWEN_INFERENCE_ENDPOINT` | (public VPS) | Override AI inference endpoint for self-hosted setups |
| `QWEN_TIMEOUT_MS` | 15000 | AI inference request timeout |
| `QWEN_MAX_RETRIES` | 2 | Retry count for AI inference failures |

### Output Format

Tool responses are returned as **Markdown tables by default**. If you need raw
JSON for programmatic use, set:

```bash
OUTPUT_FORMAT=json
```

## Data Sources

| Source | Position in Chain | Usage | API Keys |
|--------|-------------------|-------|----------|
| **RDAP** | 1st (Primary) | Fast availability check | Not needed |
| **GoDaddy** | 2nd (Fallback) | Premium/auction detection | Not needed |
| **WHOIS** | 3rd (Last resort) | Legacy availability | Not needed |
| Pricing API | Parallel | Live pricing via backend | Backend token |
| Porkbun API | Parallel (BYOK) | Availability + pricing | API key + secret |
| Namecheap API | Parallel (BYOK) | Availability + pricing | API key + IP whitelist |
| Sedo Feed | Enrichment | Aftermarket auction hints | Not needed |

## Pricing Behavior

- Live price is attempted first for every **available** domain.
- If live quotes fail or are rate-limited, the result falls back to the catalog estimate and includes `price_note`.
- Always verify pricing via `price_check_url` before purchase.

## Examples

### Basic Search (No API Keys)

```
search_domain("myproject", ["com", "io", "dev"])

┌─────────────────┬───────────┬─────────┬────────┐
│ Domain          │ Available │ Premium │ Source │
├─────────────────┼───────────┼─────────┼────────┤
│ myproject.com   │ ✅        │ No      │ rdap   │
│ myproject.io    │ ❌        │ -       │ rdap   │
│ myproject.dev   │ ✅        │ Yes     │ godaddy│
└─────────────────┴───────────┴─────────┴────────┘
```

### AI-Powered Suggestions

```
suggest_domains_smart("coffee shop in seattle", { style: "brandable" })

→ seattlebrew.com, pugetperk.io, raincitycoffee.co, cascadiacafe.com
```

### Bulk Check

```
bulk_search(["startup", "launch", "begin", "init"], "io")

→ Checks startup.io, launch.io, begin.io, init.io in parallel
```

## Development

```bash
npm run dev       # watch mode
npm test          # run Jest
npm run build     # compile to dist/
```

## Release

See `docs/RELEASE.md` for the canary -> latest publish flow. Tags like `v1.2.24`
trigger GitHub Releases + npm publish via CI.

## Changelog

See `CHANGELOG.md` for release history.

## Security Notes

- Do not commit API keys or `.mcpregistry_*` files.
- Without `PRICING_API_BASE_URL` (or BYOK keys), pricing is not available (availability still works).

## Upgrading

### For npx Users

If you use `npx domain-search-mcp` (without `@latest`), npx may cache an old version.

**Fix**: Update your MCP config to use `@latest`:
```json
"args": ["-y", "domain-search-mcp@latest"]
```

Or clear the npx cache manually:
```bash
npx clear-npx-cache  # then restart your MCP client
```

### For Source/Git Users

```bash
cd domain-search-mcp
git pull origin main
npm install
npm run build
```

### Staying Updated

- **Watch the repo**: Click "Watch" → "Releases only" on [GitHub](https://github.com/dorukardahan/domain-search-mcp) to get notified of new versions.
- **Check releases**: See [GitHub Releases](https://github.com/dorukardahan/domain-search-mcp/releases) for changelog and upgrade notes.
- **npm page**: [npmjs.com/package/domain-search-mcp](https://www.npmjs.com/package/domain-search-mcp) shows the latest version.

## Architecture

For detailed system architecture diagrams, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

- Transport layer (stdio vs HTTP/SSE)
- Tool execution flow
- Data source waterfall (RDAP → Pricing API → WHOIS)
- VPS deployment architecture
- AI suggestion flow
- MCP session lifecycle

## Why This Tool?

| Problem | Solution |
|---------|----------|
| Domain APIs require signup/keys | RDAP + GoDaddy = zero-config availability |
| Premium domains show as "available" | GoDaddy detects premium/auction status |
| Hard to check multiple TLDs | Single call checks .com, .io, .dev, etc. |
| No AI integration for naming | Built-in Qwen 7B for brandable suggestions |
| Only works with Claude | HTTP transport supports ChatGPT, LM Studio |

## FAQ

**Q: Does this work without any API keys?**
A: Yes! Availability checking uses public RDAP and GoDaddy endpoints. Only pricing requires API keys.

**Q: Which MCP clients are supported?**
A: Claude Desktop, Claude Code, VS Code, Cursor, Cline (stdio), and ChatGPT, LM Studio (HTTP/SSE).

**Q: How accurate is premium domain detection?**
A: GoDaddy's public endpoint detects most premium and auction domains. Always verify on registrar checkout.

**Q: Can I self-host the AI suggestions?**
A: Yes! Set `QWEN_INFERENCE_ENDPOINT` to your llama.cpp server running the fine-tuned model.

## Links

- **npm**: [npmjs.com/package/domain-search-mcp](https://www.npmjs.com/package/domain-search-mcp)
- **MCP Registry**: [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)
- **Glama**: [glama.ai/mcp/servers/@dorukardahan/domain-search-mcp](https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp)
- **Context7**: [context7.com/dorukardahan/domain-search-mcp](https://context7.com/dorukardahan/domain-search-mcp)

### Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and data flow
- [API Reference](docs/API.md) - Tool schemas and responses
- [Configuration](docs/CONFIGURATION.md) - Environment variables
- [Workflows](docs/WORKFLOWS.md) - Common usage patterns
