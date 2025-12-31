# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- -

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

[Unreleased]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.28...HEAD
[1.2.28]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.27...v1.2.28
[1.2.27]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.26...v1.2.27
[1.2.26]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.25...v1.2.26
[1.2.25]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.24...v1.2.25
[1.2.24]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.23...v1.2.24
[1.2.23]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.22...v1.2.23
[1.2.22]: https://github.com/dorukardahan/domain-search-mcp/compare/v1.2.21...v1.2.22
