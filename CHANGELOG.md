# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- -

## [1.9.8] - 2026-01-05
### Fixed
- **CRITICAL**: Fixed false positives for .ai TLD (domains reported as "available" when actually registered)
- Added WHOIS cross-verification for unreliable RDAP TLDs (.ai, .io, .sh, .ac)
- Implemented native TCP WHOIS lookup for accurate .ai/.io/.sh/.ac domain status

### Changed
- RDAP 404 responses for .ai/.io/.sh/.ac now trigger WHOIS verification
- WHOIS module now uses native TCP (port 43) for TLDs with unreliable web APIs

## [1.9.6] - 2026-01-05
### Added
- Hybrid Redis + in-memory cache for horizontal scaling
- Circuit breaker with automatic Redis fallback to in-memory
- Connection health monitoring with exponential backoff reconnection

### Changed
- Cache layer now uses Redis as primary with seamless in-memory fallback

## [1.9.5] - 2026-01-04
### Added
- `ai_health` tool for monitoring AI inference service status
- Circuit breaker state visibility (closed/open/half-open)
- Adaptive concurrency metrics exposure

## [1.9.4] - 2026-01-04
### Added
- Adaptive batch sizing for AI inference based on response times
- Dynamic concurrency adjustment (1-4 parallel requests)
- Batch size optimization (1-5) based on latency percentiles

## [1.9.3] - 2026-01-04
### Added
- Circuit breaker pattern for AI inference resilience
- Parallel AI suggestion generation with Promise.allSettled
- Automatic fallback to semantic engine on AI failures

### Changed
- AI suggestion flow now uses parallel requests with circuit breaker protection

## [1.9.2] - 2026-01-03
### Added
- `/metrics` endpoint with Prometheus-compatible format
- Cache hit/miss statistics per cache type
- Request latency histograms
- AI inference success/failure counters

## [1.9.1] - 2026-01-02
### Added
- HTTP transport rate limiting (100 requests/minute per IP)
- Rate limit bypass for `/health` endpoint
- Connection tracking and cleanup on disconnect

## [1.9.0] - 2026-01-01
### Added
- HTTP/SSE transport mode (`--http` flag or `MCP_TRANSPORT=http`)
- OpenAPI 3.1 specification auto-generation from Zod schemas
- REST API endpoints (`/api/tools/*`) for ChatGPT Actions compatibility
- Session management with UUID tracking
- CORS support with configurable origins

### Changed
- Server now supports dual transport: stdio (default) and HTTP

## [1.8.1] - 2025-12-31
### Fixed
- Sync SERVER_VERSION constant with package.json version

## [1.8.0] - 2025-12-31
### Added
- Zero-config AI-powered suggestions via public Qwen 7B-DPO inference
- `suggest_domains_smart` tool with fine-tuned domain generation
- OpenRouter fallback for AI inference redundancy
- Security hardening for inference endpoints

### Changed
- AI suggestions now work out of the box without API keys

## [1.6.2] - 2025-12-31
### Fixed
- CI/CD release workflow for proper npm publishing with provenance

## [1.5.1] - 2025-12-31
### Fixed
- RDAP false positives corrected using backend availability signal

### Removed
- GoDaddy direct API integration (replaced with backend)

## [1.5.0] - 2025-12-31
### Added
- Federated negative cache system for pre-filtering taken domains
- `expiring_domains` tool for monitoring domains approaching expiration
- Cache backend deployment scripts for VPS

## [1.4.0] - 2025-12-31
### Added
- Security improvements for API key handling
- Performance optimizations for bulk searches

## [1.3.2] - 2025-12-31
### Fixed
- WHOIS API error response handling

## [1.3.1] - 2025-12-31
### Fixed
- SERVER_VERSION sync with package.json

## [1.3.0] - 2025-12-31
### Added
- `analyze_project` tool for scanning local/GitHub projects and suggesting matching domains
- `hunt_domains` tool for domain investment opportunities (Sedo auctions, pattern generation, investment scoring)
- Project manifest parsing (package.json, pyproject.toml, Cargo.toml, go.mod)
- README keyword extraction for better suggestions

## [1.2.32] - 2025-12-30
### Fixed
- who.is parser fix for production

## [1.2.31] - 2025-12-30
### Fixed
- who.is parser updated for Next.js HTML format changes

## [1.2.30] - 2025-12-30
### Fixed
- WHOIS fail-safe on ambiguous API responses

## [1.2.29] - 2025-12-30
### Added
- llama.cpp integration for local Qwen AI domain suggestions

## [1.2.28] - 2025-12-30
### Changed
- Refined smart suggestion filtering for crypto/tech prompts to avoid fragment outputs.
- Prefer Porkbun price check links when pricing backend is enabled and registrar is unknown.

## [1.2.27] - 2025-12-30
### Added
- Nameserver-based aftermarket hints (Sedo/Dan/Afternic) with cache + timeout controls.
- RDAP bootstrap caching with IANA fallback reuse.
- Compact table output with pricing labels and link consolidation.
- Tests for Sedo parsing, RDAP bootstrap cache, and table formatting.

## [1.2.26] - 2025-12-30
### Added
- Release Drafter automation for release notes (labels -> changelog).

## [1.2.25] - 2025-12-30
### Added
- GitHub Actions release workflow that publishes with provenance and creates GitHub Releases.

## [1.2.24] - 2025-12-30
### Added
- Release workflow documentation and local publish scripts (canary/latest).

## [1.2.23] - 2025-12-30
### Added
- Sedo public feed lookup for aftermarket auction hints (configurable TTL + feed URL).

## [1.2.22] - 2025-12-30
### Changed
- Removed Dynadot backend usage due to ToS restrictions.

[Unreleased]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.9.8...HEAD
[1.9.8]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.9.6...v1.9.8
[1.9.6]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.9.5...v1.9.6
[1.9.5]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.9.4...v1.9.5
[1.9.4]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.9.3...v1.9.4
[1.9.3]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.9.2...v1.9.3
[1.9.2]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.9.1...v1.9.2
[1.9.1]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.6.2...v1.8.0
[1.6.2]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.5.1...v1.6.2
[1.5.1]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.32...v1.3.0
[1.2.32]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.31...v1.2.32
[1.2.31]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.30...v1.2.31
[1.2.30]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.29...v1.2.30
[1.2.29]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.28...v1.2.29
[1.2.28]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.27...v1.2.28
[1.2.27]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.26...v1.2.27
[1.2.26]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.25...v1.2.26
[1.2.25]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.24...v1.2.25
[1.2.24]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.23...v1.2.24
[1.2.23]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.22...v1.2.23
[1.2.22]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.21...v1.2.22
