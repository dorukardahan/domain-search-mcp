# Domain Search MCP

Fast domain availability checks for AI assistants and local workflows. The server runs fully local, falls back to public RDAP/WHOIS when no API keys are configured, and optionally enriches results with registrar pricing when keys are present.

<a href="https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@dorukardahan/domain-search-mcp/badge" alt="Domain Search MCP" />
</a>

## What This MCP Does

- Checks domain availability across multiple TLDs.
- Returns registrar pricing when API keys are configured.
- Detects premium/auction signals via GoDaddy public endpoint (search_domain only).
- Suggests names and checks social handles.

## Architecture Overview

Availability and pricing are intentionally separated:

- **Availability (default, always on):**
  - Primary: RDAP
  - Fallback: WHOIS
  - GoDaddy public endpoint: premium/auction signal only, used in `search_domain`
- **Pricing (optional, BYOK):**
  - Porkbun and Namecheap adapters provide first-year/renewal pricing if keys are configured.
  - If no keys are set, prices are `null`.

This keeps the MCP zero-config while still allowing power users to enable pricing.

## Tools

- `search_domain`: Check a single name across multiple TLDs. Includes GoDaddy premium/auction signal.
- `bulk_search`: Check up to 100 names for a single TLD. Uses RDAP/WHOIS unless a registrar is specified.
- `compare_registrars`: Compare pricing for a domain across registrars (meaningful only with API keys).
- `suggest_domains`: Generate simple variations (prefix/suffix/hyphen).
- `suggest_domains_smart`: AI-assisted suggestions (GoDaddy signal may be used indirectly via availability checks).
- `tld_info`: TLD metadata and guidance.
- `check_socials`: Username availability across platforms.

## Quick Start

```bash
git clone https://github.com/dorukardahan/domain-search-mcp.git
cd domain-search-mcp
npm install
npm run build
```

### Run Locally

```bash
npm start
```

### Claude Desktop

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

## Configuration

### Optional API Keys (Pricing)

Porkbun (recommended):

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

## Data Sources (Current Behavior)

| Source | Usage | Pricing |
|--------|-------|---------|
| Porkbun API | Availability + pricing | Yes (with keys) |
| Namecheap API | Availability + pricing | Yes (with keys) |
| RDAP | Primary availability | No |
| WHOIS | Fallback availability | No |
| GoDaddy public endpoint | Premium/auction signal only (search_domain) | No |

## Example Output (No API Keys)

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
- Without API keys, availability still works but pricing is not available.

## Context7

This repo is indexed for Context7. Metadata lives in `context7.json`:
- URL: https://context7.com/dorukardahan/domain-search-mcp

## Documentation

- [API Reference](docs/API.md)
- [Configuration](docs/CONFIGURATION.md)
- [Workflows](docs/WORKFLOWS.md)
