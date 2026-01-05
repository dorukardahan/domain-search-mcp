# Domain Search MCP - Architecture

This document provides detailed architectural diagrams for the Domain Search MCP server.

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Transport Layer](#transport-layer)
- [HTTP Transport Details](#http-transport-details)
- [Tool Execution Flow](#tool-execution-flow)
- [Data Source Waterfall](#data-source-waterfall)
- [VPS Deployment](#vps-deployment)
- [AI Suggestion Flow](#ai-suggestion-flow)
- [MCP Session Lifecycle](#mcp-session-lifecycle)
- [Directory Structure](#directory-structure)

---

## High-Level Overview

```mermaid
flowchart TB
    subgraph Clients["MCP Clients"]
        subgraph STDIO["stdio Transport"]
            CD[Claude Desktop]
            CU[Cursor]
            VS[VS Code]
            PX[Perplexity]
        end
        subgraph HTTP["HTTP Transport"]
            CG[ChatGPT]
            LM[LM Studio]
            WC[Web Clients]
        end
    end

    subgraph Local["Local Execution"]
        NPX["npx domain-search-mcp@latest"]
    end

    subgraph VPS["Production VPS"]
        HTTPS["https://vmi3000318.contaboserver.net"]
    end

    CD & CU & VS & PX --> NPX
    CG & LM & WC --> HTTPS

    NPX --> SERVER
    HTTPS --> SERVER

    subgraph SERVER["Domain Search MCP Server (v1.9.6)"]
        TOOLS[11 MCP Tools]
    end
```

---

## Transport Layer

The server supports two transport modes, selected at runtime:

```mermaid
flowchart TD
    START[server.ts] --> CONFIG["getTransportConfig()"]
    CONFIG --> CHECK{config.type?}

    CHECK -->|"stdio (default)"| STDIO["StdioServerTransport"]
    CHECK -->|"http (--http flag)"| HTTP["createHttpTransport()"]

    STDIO --> STDIN["stdin: JSON-RPC input"]
    STDIO --> STDOUT["stdout: JSON-RPC output"]

    HTTP --> EXPRESS["Express.js Server"]
    EXPRESS --> PORT["Port 3001 (VPS)"]
    EXPRESS --> RATE["Rate Limit: 100/min"]
    EXPRESS --> CORS["CORS Enabled"]
    EXPRESS --> SESSIONS["Session Management"]
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport mode |
| `MCP_PORT` | `3000` | HTTP server port |
| `MCP_HOST` | `0.0.0.0` | HTTP server bind address |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |

---

## HTTP Transport Details

```mermaid
flowchart TB
    subgraph MW["Middleware Stack"]
        direction LR
        JSON["JSON Parser"] --> CORS["CORS"] --> RATE["Rate Limiter<br/>100/min/IP"]
    end

    REQ[Request] --> MW --> ROUTER

    subgraph ROUTER["Express Router"]
        ROOT["GET /"]
        HEALTH["GET /health"]
        OPENAPI["GET /openapi.json"]
        METRICS["GET /metrics"]
        MCP["ALL /mcp"]
        API["POST /api/tools/*"]
    end

    ROOT --> INFO["Server info JSON"]
    HEALTH --> STATUS["Status, uptime, sessions"]
    OPENAPI --> SPEC["OpenAPI 3.1 Spec<br/>(auto-generated from Zod)"]
    METRICS["/metrics"] --> PROM["Prometheus metrics<br/>(cache stats, latency)"]

    MCP --> MCPCHECK{Method?}
    MCPCHECK -->|POST| MESSAGES["JSON-RPC Messages"]
    MCPCHECK -->|GET| SSE["SSE Stream"]

    MESSAGES --> INIT{Has Session?}
    INIT -->|No| CREATE["Create new session<br/>Generate UUID"]
    INIT -->|Yes| LOOKUP["Lookup existing session"]

    API --> REST["REST API<br/>(ChatGPT Actions)"]

    subgraph SESSIONS["Session Store"]
        S1["Session A<br/>uuid-1234"]
        S2["Session B<br/>uuid-5678"]
        S3["Session C<br/>uuid-9012"]
    end

    CREATE --> SESSIONS
    LOOKUP --> SESSIONS
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Server info |
| GET | `/health` | Health check (bypasses rate limit) |
| GET | `/openapi.json` | OpenAPI 3.1 specification |
| GET | `/metrics` | Prometheus-compatible metrics |
| POST | `/mcp` | MCP JSON-RPC messages |
| GET | `/mcp` | MCP SSE stream |
| POST | `/api/tools/:name` | REST API for ChatGPT Actions |

---

## Tool Execution Flow

```mermaid
flowchart TD
    REQ["Client Request"] --> EXEC["executeToolCall()"]

    EXEC --> SWITCH{"switch(toolName)"}

    SWITCH -->|search_domain| SD["executeSearchDomain()"]
    SWITCH -->|bulk_search| BS["executeBulkSearch()"]
    SWITCH -->|suggest_domains| SG["executeSuggestDomains()"]
    SWITCH -->|suggest_domains_smart| AI["executeSuggestDomainsSmart()"]
    SWITCH -->|compare_registrars| CR["executeCompareRegistrars()"]
    SWITCH -->|tld_info| TI["executeTldInfo()"]
    SWITCH -->|check_socials| CS["executeCheckSocials()"]
    SWITCH -->|whois_lookup| WH["executeWhoisLookup()"]
    SWITCH -->|dns_lookup| DNS["executeDnsLookup()"]
    SWITCH -->|get_premium_info| PI["executeGetPremiumInfo()"]

    SD & BS & SG & AI & CR --> VALIDATE["1. Zod Schema Validation"]
    VALIDATE --> SERVICE["2. Service Layer Call"]
    SERVICE --> FORMAT["3. Response Formatting"]
    FORMAT --> RESP["Response<br/>(Markdown table or JSON)"]
```

---

## Data Source Waterfall

The system uses multiple data sources in a waterfall pattern:

```mermaid
flowchart TD
    START["searchDomains(names, tlds)"] --> RDAP

    subgraph PRIMARY["Primary: Availability"]
        RDAP["RDAP<br/>(Public registry data)"]
    end

    RDAP --> AVAIL{Available?}

    AVAIL -->|Yes| PRICING
    AVAIL -->|No| AFTERMARKET

    subgraph ENRICHMENT["Enrichment: Pricing"]
        PRICING["Pricing API Backend<br/>(Porkbun via localhost:3000)"]
    end

    PRICING --> PRICEFAIL{Success?}
    PRICEFAIL -->|Yes| RESULT
    PRICEFAIL -->|No| FALLBACK

    subgraph FALLBACK_SOURCES["Fallback"]
        FALLBACK["WHOIS<br/>(If RDAP fails)"]
    end

    subgraph AFTERMARKET_SOURCES["Aftermarket Hints"]
        AFTERMARKET["Sedo Feed + NS Lookup"]
        GODADDY["GoDaddy Public<br/>(Premium/Auction signals)"]
    end

    AFTERMARKET --> RESULT
    FALLBACK --> RESULT

    RESULT["DomainResult<br/>{status, price, source, aftermarket}"]
```

**Source Priority:**

1. **RDAP** - Fast, free, reliable availability data
2. **Pricing API** - Live Porkbun quotes, corrects RDAP false positives
3. **WHOIS** - Fallback when RDAP unavailable
4. **GoDaddy Public** - Premium/auction signals for `search_domain`
5. **Sedo Feed** - Aftermarket auction hints for taken domains

---

## VPS Deployment

```mermaid
flowchart TB
    subgraph INTERNET["Internet"]
        CLIENT["Clients"]
    end

    CLIENT -->|HTTPS :443| NGINX

    subgraph VPS["Contabo VPS (95.111.240.197)"]
        subgraph NGINX_BLOCK["NGINX"]
            NGINX["Reverse Proxy<br/>SSL Termination<br/>Let's Encrypt"]
        end

        NGINX -->|:3000| MCP_SERVICE
        MCP_SERVICE -.->|:8000| LLAMA_SERVICE
        MCP_SERVICE -.->|:6379| REDIS_SERVICE

        subgraph SERVICES["systemd Services"]
            MCP_SERVICE["domain-mcp.service<br/>/var/www/domain-mcp<br/>Port 3000"]
            LLAMA_SERVICE["qwen-inference.service<br/>Qwen 7B DPO<br/>Port 8000<br/>(AI Inference)"]
            REDIS_SERVICE["redis-server.service<br/>Port 6379<br/>(Distributed Cache)"]
        end
    end
```

**Service Configuration:**

| Service | Port | Purpose |
|---------|------|---------|
| `domain-mcp` | 3000 | MCP HTTP server |
| `qwen-inference` | 8000 | Qwen 7B AI inference |
| `redis-server` | 6379 | Distributed cache |

**Production URLs:**

- `https://vmi3000318.contaboserver.net` - Server info
- `https://vmi3000318.contaboserver.net/mcp` - MCP protocol
- `https://vmi3000318.contaboserver.net/openapi.json` - OpenAPI spec
- `https://vmi3000318.contaboserver.net/health` - Health check
- `https://vmi3000318.contaboserver.net/metrics` - Prometheus metrics

---

## AI Suggestion Flow

The `suggest_domains_smart` tool uses a fine-tuned Qwen 7B model:

```mermaid
sequenceDiagram
    participant C as Client
    participant M as MCP Server
    participant Q as Qwen 7B (Port 8000)
    participant R as RDAP
    participant P as Pricing API

    C->>M: suggest_domains_smart<br/>"AI coffee shop finder app"

    M->>Q: POST /v1/chat/completions
    Q-->>M: ["brewbot", "coffeewise", "beanfinder", ...]

    par Parallel availability checks
        M->>R: Check brewbot.com, .io
        M->>R: Check coffeewise.com, .io
        M->>R: Check beanfinder.com, .io
    end

    R-->>M: Availability results

    loop For each available domain
        M->>P: Get live price
        P-->>M: Price quote
    end

    M-->>C: Markdown table with results
```

---

## MCP Session Lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant SM as Session Map

    Note over C,SM: 1. Initialize
    C->>S: POST /mcp<br/>{"method": "initialize"}
    S->>SM: Create new transport<br/>Generate UUID
    S-->>C: Response<br/>Mcp-Session-Id: uuid-xxxx

    Note over C,SM: 2. Tool Calls
    C->>S: POST /mcp<br/>Mcp-Session-Id: uuid-xxxx<br/>{"method": "tools/call"}
    S->>SM: Lookup session
    SM-->>S: Transport instance
    S-->>C: {"result": {...}}

    Note over C,SM: 3. SSE Stream (Optional)
    C->>S: GET /mcp<br/>Mcp-Session-Id: uuid-xxxx
    S-->>C: SSE: event: message<br/>data: {...}

    Note over C,SM: 4. Cleanup
    C-xS: Disconnect
    S->>SM: onclose() triggered
    SM->>SM: Remove session<br/>Free resources
```

---

## Directory Structure

```
domain-search-mcp/
├── src/
│   ├── server.ts                 # Entry point, transport selection
│   │
│   ├── transports/
│   │   ├── index.ts              # TransportConfig, getTransportConfig()
│   │   └── http.ts               # Express server, session management
│   │
│   ├── tools/
│   │   ├── index.ts              # Export all tools
│   │   ├── search-domain.ts      # search_domain tool
│   │   ├── bulk-search.ts        # bulk_search tool
│   │   ├── suggest-domains.ts    # suggest_domains tool
│   │   ├── suggest-smart.ts      # suggest_domains_smart (AI)
│   │   └── ...                   # Other tools
│   │
│   ├── services/
│   │   ├── domain-search.ts      # Main orchestration layer
│   │   ├── pricing-api.ts        # Backend API client
│   │   └── qwen-inference.ts     # AI suggestion service
│   │
│   ├── registrars/
│   │   ├── base.ts               # RegistrarAdapter base class
│   │   ├── porkbun.ts            # Porkbun API adapter
│   │   ├── namecheap.ts          # Namecheap API adapter
│   │   └── godaddy-public.ts     # GoDaddy public endpoint
│   │
│   ├── fallbacks/
│   │   ├── rdap.ts               # RDAP availability check
│   │   └── whois.ts              # WHOIS fallback
│   │
│   ├── openapi/
│   │   ├── generator.ts          # OpenAPI 3.1 spec generator
│   │   └── schemas.ts            # Zod to OpenAPI registration
│   │
│   ├── api/
│   │   └── routes.ts             # REST API router (/api/tools/*)
│   │
│   └── utils/
│       ├── cache.ts              # TTL-based in-memory cache
│       ├── redis-cache.ts        # Hybrid Redis + in-memory cache
│       ├── circuit-breaker.ts    # Circuit breaker pattern
│       ├── adaptive-concurrency.ts # Dynamic batch sizing
│       ├── metrics.ts            # Prometheus metrics
│       ├── errors.ts             # Error types
│       └── validators.ts         # Input validation
│
├── docs/
│   ├── ARCHITECTURE.md           # This file
│   └── MULTI_PLATFORM_EXPANSION.md
│
└── package.json                  # v1.9.6
```

---

## Key Design Decisions

1. **Dual Transport Architecture**: Same tool code serves both stdio and HTTP clients - no code duplication.

2. **Waterfall Data Sources**: RDAP → Pricing API → WHOIS chain ensures fast results with pricing enrichment.

3. **Session-based HTTP**: Each HTTP client gets isolated session with automatic cleanup on disconnect.

4. **Rate Limiting Strategy**: Global HTTP rate limiting (100/min) protects against abuse while per-registrar limits protect API quotas.

5. **OpenAPI Auto-generation**: Schemas defined once in Zod, automatically converted to OpenAPI 3.1 for ChatGPT Actions compatibility.

6. **Hybrid Caching**: Redis as primary cache with automatic fallback to in-memory. Circuit breaker pattern prevents Redis failures from affecting availability.

7. **Circuit Breaker Pattern**: All external services (Redis, AI inference) protected by circuit breakers with exponential backoff and automatic recovery.

8. **Adaptive Concurrency**: AI inference dynamically adjusts batch size and parallelism based on response latency percentiles.
