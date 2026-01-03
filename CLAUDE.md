# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode with tsx
npm start          # Run compiled server
npm test           # Run all tests
npm run test:unit  # Run unit tests only
npm run coverage   # Run tests with coverage
```

Run a single test file:
```bash
npx jest tests/unit/cache.test.ts
npx jest --testPathPattern="validators"
```

## Architecture Overview

This is an MCP (Model Context Protocol) server for domain availability searches. It aggregates data from multiple registrars and fallback sources.

### Core Flow

```
server.ts (MCP Server)
    ↓
tools/*.ts (Tool definitions + executors)
    ↓
services/domain-search.ts (Orchestration layer)
    ↓
registrars/*.ts (API adapters) → Porkbun, Namecheap
    or
services/pricing-api.ts (Backend for pricing + availability correction)
    or
fallbacks/*.ts (RDAP, WHOIS)
```

### Key Components

**Tools** (`src/tools/`): Each MCP tool has three exports:
- `*Tool`: Tool definition (name, description, schema)
- `*Schema`: Zod validation schema
- `execute*`: Execution function

**Registrar Adapters** (`src/registrars/`): All extend `RegistrarAdapter` base class which provides:
- Token bucket rate limiting
- Retry with exponential backoff
- Timeout handling
- Standardized `DomainResult` creation

**Domain Search Service** (`src/services/domain-search.ts`): Orchestrates source selection:
1. RDAP (fast, public registry data) - availability check
2. Pricing API backend (if `PRICING_API_BASE_URL` set) - pricing + **availability correction**
3. Porkbun API (if BYOK keys configured)
4. Namecheap API (if BYOK keys configured)
5. WHOIS (last resort fallback)

**Important**: Backend's Porkbun response overrides RDAP false positives.

**Utilities** (`src/utils/`):
- `cache.ts`: TTL-based in-memory cache
- `errors.ts`: Structured error types with retry hints
- `premium-analyzer.ts`: Domain quality scoring and premium detection
- `semantic-engine.ts`: AI-powered domain name generation

### Type System

Core types in `src/types.ts`:
- `DomainResult`: Complete domain availability/pricing info
- `SearchResponse`: Results + insights + next_steps
- `DataSource`: Enum of where data came from
- `Config`: Environment configuration shape

### Configuration

Server works without API keys (falls back to RDAP/WHOIS). For pricing data, configure in `.env`:
- `PORKBUN_API_KEY` + `PORKBUN_API_SECRET`: Fast with pricing
- `NAMECHEAP_API_KEY` + `NAMECHEAP_API_USER`: Requires IP whitelist

### Adding a New Tool

1. Create `src/tools/new_tool.ts` with schema, tool definition, and executor
2. Export from `src/tools/index.ts`
3. Add to `TOOLS` array and `executeToolCall` switch in `server.ts`

### Adding a New Registrar

1. Create `src/registrars/new_registrar.ts` extending `RegistrarAdapter`
2. Implement `search()`, `getTldInfo()`, `isEnabled()`
3. Export from `src/registrars/index.ts`
4. Add to source selection logic in `services/domain-search.ts`

## NPM Release Workflow

**IMPORTANT**: Never manually run `npm publish`. Always use Git tags to trigger GitHub Actions.

### Correct Release Process

```bash
# 1. Make code changes
# 2. Update version in package.json (e.g., "1.6.3")

# 3. Commit and push
git add -A
git commit -m "feat: description of changes"
git push origin main

# 4. Create and push version tag - THIS TRIGGERS THE RELEASE
git tag v1.6.3
git push origin v1.6.3

# 5. GitHub Actions automatically:
#    ✓ Runs npm ci && npm run build
#    ✓ Publishes to npm with provenance attestation
#    ✓ Creates GitHub Release with release notes
```

### Why Not Manual `npm publish`?

| Method | Provenance | Automated | Release Notes |
|--------|------------|-----------|---------------|
| Manual `npm publish` | ❌ | ❌ | ❌ |
| Git tag → Actions | ✅ | ✅ | ✅ |

Provenance proves the package was built from the exact GitHub commit.

### Workflow Files

- `.github/workflows/release.yml` - Triggered on `v*.*.*` tags
- `.github/workflows/release-drafter.yml` - Auto-generates release notes
