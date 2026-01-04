# Domain Search MCP - Multi-Platform Expansion

**Completed:** January 4, 2026
**Version:** 1.9.1
**Production:** https://vmi3000318.contaboserver.net

---

## Executive Summary

Successfully expanded domain-search-mcp from stdio-only to dual-transport (stdio + HTTP/SSE) architecture. All 4 phases completed in a single session. Published v1.9.1 to npm with production VPS deployment.

---

## Phase 1: HTTP Transport Foundation

### New Files Created

1. **`src/transports/index.ts`** - Transport abstraction layer
   - `TransportType = 'stdio' | 'http'`
   - `TransportConfig` interface with type, port, host, corsOrigins
   - `getTransportConfig()` function reads from CLI args or env vars

2. **`src/transports/http.ts`** - Express HTTP/SSE server (302 lines)
   - Uses `StreamableHTTPServerTransport` from MCP SDK (2025-06-18 spec)
   - Single `/mcp` endpoint handles both POST (messages) and GET (SSE stream)
   - Session management with `Mcp-Session-Id` header
   - Session cleanup on disconnect via `onclose`/`onerror` handlers
   - Rate limiting: 100 req/min per IP via express-rate-limit (v1.9.1)
   - Health check at `/health` bypasses rate limiting
   - CORS configured for web clients

### Dependencies Added

- express ^5.2.1
- cors ^2.8.5
- express-rate-limit ^8.2.1
- @types/express, @types/cors (dev)

### package.json Scripts

```json
"start:http": "node dist/server.js --http",
"dev:http": "tsx src/server.ts --http"
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | stdio | Transport mode: `stdio` or `http` |
| `MCP_PORT` | 3000 | HTTP server port |
| `MCP_HOST` | 0.0.0.0 | HTTP server bind address |
| `CORS_ORIGINS` | * | Allowed CORS origins (comma-separated) |

---

## Phase 2: OpenAPI Specification

### New Files Created

1. **`src/openapi/generator.ts`** - OpenAPI 3.1 spec generator
   - Uses @asteasolutions/zod-to-openapi
   - Auto-registers all 10 MCP tools as REST endpoints
   - Dynamic baseUrl from request headers (x-forwarded-proto, x-forwarded-host)
   - Descriptions truncated to 300 chars (ChatGPT limit)

2. **`src/openapi/schemas.ts`** - Zod schemas with OpenAPI metadata
   - Wraps existing tool schemas with `extendZodWithOpenApi`
   - Registers each schema in OpenAPIRegistry

3. **`src/api/routes.ts`** - REST API router for ChatGPT Actions
   - POST `/api/tools/:toolName` - Execute any tool via REST
   - Routes: search_domain, bulk_search, compare_registrars, suggest_domains, suggest_domains_smart, tld_info, check_socials, whois_lookup, dns_lookup, get_premium_info

### Endpoints

- `/openapi.json` - Auto-generated OpenAPI 3.1 specification
- `/api/tools/*` - REST API for each tool (ChatGPT Actions compatible)

---

## Phase 3: ChatGPT Integration

### Testing Process

1. Started HTTP server locally: `npm run start:http`
2. Exposed via ngrok: `ngrok http 3000`
3. Tested MCP connection and REST API endpoints
4. Verified tools work via POST requests

### REST API Format

```bash
curl -X POST https://your-domain/api/tools/search_domain \
  -H "Content-Type: application/json" \
  -d '{"domain_name":"vibecoding"}'
```

---

## Phase 4: Production Deployment

### VPS Details

| Item | Value |
|------|-------|
| Server | Contabo VPS (qwen-inference-server) |
| IP | 95.111.240.197 |
| Hostname | vmi3000318.contaboserver.net |
| User | admin |
| Directory | /var/www/domain-mcp |

### Existing Services on VPS

- `domain-cache.service` on port 3000 (Porkbun pricing backend)
- `llama-server.service` on port 8000 (Qwen 7B inference)

### New Service Created

**`/etc/systemd/system/domain-mcp-http.service`**:

```ini
[Unit]
Description=Domain Search MCP HTTP Server
After=network.target domain-cache.service

[Service]
Type=simple
User=admin
WorkingDirectory=/var/www/domain-mcp
ExecStart=/usr/bin/node dist/server.js --http
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=MCP_PORT=3001
Environment=MCP_HOST=127.0.0.1
Environment=PRICING_API_BASE_URL=http://127.0.0.1:3000

[Install]
WantedBy=multi-user.target
```

### Nginx Configuration

**`/etc/nginx/sites-available/domain-mcp`**:

- SSL termination with Let's Encrypt
- Reverse proxy to port 3001
- SSE-specific settings (proxy_buffering off, proxy_cache off)
- WebSocket upgrade headers

### SSL Certificate

- Provider: Let's Encrypt via Certbot
- Domain: vmi3000318.contaboserver.net
- Auto-renewal configured

### Production Endpoints

| Endpoint | URL |
|----------|-----|
| Server Info | https://vmi3000318.contaboserver.net |
| MCP Protocol | https://vmi3000318.contaboserver.net/mcp |
| OpenAPI Spec | https://vmi3000318.contaboserver.net/openapi.json |
| Health Check | https://vmi3000318.contaboserver.net/health |
| REST API | https://vmi3000318.contaboserver.net/api/tools/* |

---

## Version History

### v1.9.0 (January 4, 2026)

- HTTP/SSE transport with StreamableHTTPServerTransport
- OpenAPI 3.1 auto-generation from Zod schemas
- REST API for ChatGPT Actions compatibility
- VPS deployment with nginx reverse proxy

### v1.9.1 (January 4, 2026)

- Added express-rate-limit (100 req/min per IP)
- Health check endpoint bypasses rate limiting
- SSL with Let's Encrypt

---

## Key Architecture Decisions

### 1. StreamableHTTPServerTransport over SSEServerTransport

MCP 2025-06-18 spec recommends single endpoint pattern:
- POST /mcp for messages
- GET /mcp for SSE stream
- Session ID in header, not URL path

### 2. Rate Limiting Strategy

- Global HTTP rate limiting (100/min) protects against abuse
- Per-registrar rate limiting still in place for API quota protection
- Health check excluded from rate limiting

### 3. Port Selection

- Port 3001 for MCP HTTP (not 3000 to avoid conflict with domain-cache)
- Nginx handles SSL and proxies to 127.0.0.1:3001

### 4. Dual Transport Coexistence

- stdio remains default for MCP clients (Claude Desktop, Cursor)
- HTTP enabled via --http flag or MCP_TRANSPORT=http
- Same tool execution code, different transport layer

---

## Platform Compatibility

| Platform | Transport | Status |
|----------|-----------|--------|
| Claude Desktop | stdio | ✅ |
| Claude Code | stdio | ✅ |
| Cursor | stdio | ✅ |
| VS Code | stdio | ✅ |
| Perplexity | stdio | ✅ |
| ChatGPT | HTTP/SSE | ✅ |
| ChatGPT Actions | REST | ✅ |
| LM Studio | HTTP | ✅ |
| Open Interpreter | HTTP | ✅ |

---

## Usage

```bash
# stdio (default - Claude, Cursor, VS Code)
npx -y domain-search-mcp@latest

# HTTP (ChatGPT, LM Studio, web clients)
npx -y domain-search-mcp@latest --http

# With custom port
MCP_PORT=8080 npx -y domain-search-mcp@latest --http
```

---

## Links

- **npm:** https://www.npmjs.com/package/domain-search-mcp
- **GitHub:** https://github.com/dorukardahan/domain-search-mcp
- **Release:** https://github.com/dorukardahan/domain-search-mcp/releases/tag/v1.9.1
