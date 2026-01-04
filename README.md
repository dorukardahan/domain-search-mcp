# Domain Search MCP

[![npm](https://img.shields.io/npm/v/domain-search-mcp?label=npm)](https://www.npmjs.com/package/domain-search-mcp)
[![downloads](https://img.shields.io/npm/dm/domain-search-mcp?label=downloads)](https://www.npmjs.com/package/domain-search-mcp)
[![license](https://img.shields.io/npm/l/domain-search-mcp)](LICENSE)
[![node](https://img.shields.io/node/v/domain-search-mcp?label=node)](https://www.npmjs.com/package/domain-search-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-2b6cb0)](https://registry.modelcontextprotocol.io)
[![Glama](https://img.shields.io/badge/Glama-Server-0ea5e9)](https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp)
[![Context7](https://img.shields.io/badge/Context7-Indexed-16a34a)](https://context7.com/dorukardahan/domain-search-mcp)

Fast, local-first domain availability checks for MCP clients. Works with zero configuration using public RDAP/WHOIS, and optionally enriches results with registrar pricing via a backend you control.

**🆕 v1.8.0+**: AI-powered domain suggestions now work out of the box! No API keys needed - `suggest_domains_smart` uses our public fine-tuned Qwen 7B-DPO model.

Built on the [Model Context Protocol](https://modelcontextprotocol.io) for Claude, Codex, VS Code, Cursor, Cline, and other MCP-compatible clients.

## What It Does

- Check a single name across multiple TLDs.
- Bulk-check up to 100 names for one TLD.
- Compare registrar pricing (uses backend when configured).
- Suggest names and validate social handles.
- Detect premium/auction signals for `search_domain`.

## How It Works

Availability and pricing are intentionally separated:

- Availability (default):
  - Primary: RDAP
  - Fallback: WHOIS
  - GoDaddy public endpoint is used only to add premium/auction signals in `search_domain`
- Pricing (optional):
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

### MCP Client Config

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

- `search_domain`: Check a name across multiple TLDs, adds premium/auction signals.
- `bulk_search`: Check up to 100 names for a single TLD.
- `compare_registrars`: Compare pricing across registrars (backend when configured).
- `suggest_domains`: Generate variations (prefix/suffix/hyphen).
- `suggest_domains_smart`: **🤖 AI-powered** brandable name generation using fine-tuned Qwen 7B-DPO. Zero-config - works instantly!
- `tld_info`: TLD metadata and restrictions.
- `check_socials`: Username availability across platforms.

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

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
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

### Output Format

Tool responses are returned as **Markdown tables by default**. If you need raw
JSON for programmatic use, set:

```bash
OUTPUT_FORMAT=json
```

## Data Sources

| Source | Usage | Pricing |
|--------|-------|---------|
| Pricing API | Pricing + premium (Porkbun) | Yes (backend) |
| Porkbun API | Availability + pricing | Yes (with keys) |
| Namecheap API | Availability + pricing | Yes (with keys) |
| RDAP | Primary availability | No |
| WHOIS | Fallback availability | No |
| GoDaddy public endpoint | Premium/auction signal for `search_domain` | No |
| Sedo public feed | Aftermarket auction hints | No |

## Pricing Behavior

- Live price is attempted first for every **available** domain.
- If live quotes fail or are rate-limited, the result falls back to the catalog estimate and includes `price_note`.
- Always verify pricing via `price_check_url` before purchase.

## Example (No API Keys)

```
search_domain("myproject", ["com", "io"])

myproject.com - available - price_first_year: null - source: rdap
myproject.io  - taken     - price_first_year: null - source: rdap
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

## Links

- MCP Registry: https://registry.modelcontextprotocol.io
- Glama page: https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp
- Context7 index: https://context7.com/dorukardahan/domain-search-mcp
- API reference: docs/API.md
- Configuration: docs/CONFIGURATION.md
- Workflows: docs/WORKFLOWS.md
