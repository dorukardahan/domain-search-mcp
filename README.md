# Domain Search MCP

[![npm](https://img.shields.io/npm/v/domain-search-mcp?label=npm)](https://www.npmjs.com/package/domain-search-mcp)
[![downloads](https://img.shields.io/npm/dm/domain-search-mcp?label=downloads)](https://www.npmjs.com/package/domain-search-mcp)
[![license](https://img.shields.io/npm/l/domain-search-mcp)](LICENSE)
[![node](https://img.shields.io/node/v/domain-search-mcp?label=node)](https://www.npmjs.com/package/domain-search-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-2b6cb0)](https://registry.modelcontextprotocol.io)
[![Glama](https://img.shields.io/badge/Glama-Server-0ea5e9)](https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp)
[![Context7](https://img.shields.io/badge/Context7-Indexed-16a34a)](https://context7.com/dorukardahan/domain-search-mcp)

Fast, local-first domain availability checks for MCP clients. Works with zero configuration using public RDAP/WHOIS, and optionally enriches results with registrar pricing when you add your own API keys.

Built on the [Model Context Protocol](https://modelcontextprotocol.io) for Claude, Codex, VS Code, Cursor, Cline, and other MCP-compatible clients.

## What It Does

- Check a single name across multiple TLDs.
- Bulk-check up to 100 names for one TLD.
- Compare registrar pricing (when keys are configured).
- Suggest names and validate social handles.
- Detect premium/auction signals for `search_domain`.

## How It Works

Availability and pricing are intentionally separated:

- Availability (default):
  - Primary: RDAP
  - Fallback: WHOIS
  - GoDaddy public endpoint is used only to add premium/auction signals in `search_domain`
- Pricing (optional):
  - Porkbun and Namecheap are BYOK adapters. If keys are missing, pricing fields are `null`.

This keeps the server zero-config while letting power users enable pricing.

## Quick Start

```bash
git clone https://github.com/dorukardahan/domain-search-mcp.git
cd domain-search-mcp
npm install
npm run build
```

Run locally:

```bash
npm start
```

Or via the CLI entrypoint:

```bash
npx domain-search-mcp
```

### MCP Client Config (Claude Desktop example)

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

## Tools

- `search_domain`: Check a name across multiple TLDs, adds premium/auction signals.
- `bulk_search`: Check up to 100 names for a single TLD.
- `compare_registrars`: Compare pricing across registrars (requires API keys).
- `suggest_domains`: Generate variations (prefix/suffix/hyphen).
- `suggest_domains_smart`: AI-assisted suggestions using the semantic engine plus GoDaddy suggestions.
- `tld_info`: TLD metadata and restrictions.
- `check_socials`: Username availability across platforms.

## Configuration

### Optional API Keys (Pricing)

Porkbun:

```bash
PORKBUN_API_KEY=pk1_your_api_key
PORKBUN_API_SECRET=sk1_your_secret
```

Namecheap (requires IP whitelist):

```bash
NAMECHEAP_API_KEY=your_api_key
NAMECHEAP_API_USER=your_username
NAMECHEAP_CLIENT_IP=your_whitelisted_ip
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORKBUN_API_KEY` | - | Porkbun API key |
| `PORKBUN_API_SECRET` | - | Porkbun API secret |
| `NAMECHEAP_API_KEY` | - | Namecheap API key |
| `NAMECHEAP_API_USER` | - | Namecheap username |
| `NAMECHEAP_CLIENT_IP` | - | Namecheap IP whitelist |
| `LOG_LEVEL` | info | Logging level |
| `CACHE_TTL_AVAILABILITY` | 60 | Availability cache TTL (seconds) |
| `CACHE_TTL_PRICING` | 3600 | Pricing cache TTL (seconds) |

## Data Sources

| Source | Usage | Pricing |
|--------|-------|---------|
| Porkbun API | Availability + pricing | Yes (with keys) |
| Namecheap API | Availability + pricing | Yes (with keys) |
| RDAP | Primary availability | No |
| WHOIS | Fallback availability | No |
| GoDaddy public endpoint | Premium/auction signal for `search_domain` | No |

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

## Security Notes

- Do not commit API keys or `.mcpregistry_*` files.
- Without API keys, pricing is not available (availability still works).

## Links

- MCP Registry: https://registry.modelcontextprotocol.io
- Glama page: https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp
- Context7 index: https://context7.com/dorukardahan/domain-search-mcp
- API reference: docs/API.md
- Configuration: docs/CONFIGURATION.md
- Workflows: docs/WORKFLOWS.md
