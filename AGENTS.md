# Repository Guidelines

## Credential persistence and release gates
- Never write password, API key, token, wallet private key or seed VALUES to memory, daily notes, reports or commits. This includes temporary and chat-supplied credentials. Store only the secret-store reference name.
- Before any memory/note/report persistence, use the checked-write entry below on the COMPLETE proposed content. Do not bypass it with write/edit/shell tools. Review plaintext context too; pattern scanning is not proof of no secrets.
- Publish only from a clean fixed git checkout through scripts/security/release.py, with an exact allowlist, real dry-run manifest and content scan. Never run npm/clawhub publish directly or publish from a workspace.
- Automatic CI releases of twitterapi-io-mcp and twitterapi-docs-mcp retain their main-push workflow and do NOT need per-version approval. Package manifest or scan failures stop publication and require owner review. Do not install main branch protection that blocks daily pushes.
- Manual releases (including ClawHub and domain-search-mcp) require explicit owner approval of the exact commit/version/manifest/digest, with upload credentials confined to the protected release environment.
- Scan full staged contents and commit messages before committing. Preserve existing hooks; never bypass a failed check. Show public repo diffs before pushing.
- Weekly: scan memory/ and reports/ in managed workspaces. Monthly: discover all owner-published ClawHub skills and npm packages and compare each latest manifest to its reviewed allowlist/previous manifest. Missing access is not a clean result.
- On suspected leakage: stop the affected write/commit/release, report only file/service/type (never values or matched text), do not test the credential, and do not rotate it without a separate instruction.


## Project Structure & Module Organization
- `src/` contains the MCP server and core logic. Key areas: `src/tools/` (tool schemas/executors), `src/services/` (orchestration + pricing API client), `src/registrars/` (adapter integrations), `src/fallbacks/` (RDAP/WHOIS), and `src/utils/` (cache, logging, concurrency).
- `tests/` holds Jest tests (`tests/unit/` + `tests/premium-analyzer.test.ts`).
- `docs/` contains API and configuration docs; `examples/` has runnable scripts.
- `dist/` is build output; `server.json` is MCP metadata; `bin/` holds the CLI entrypoint.

## Build, Test, and Development Commands
- `npm run dev`: Run the server in watch mode with `tsx`.
- `npm run build`: Compile TypeScript to `dist/`.
- `npm start`: Run the compiled server from `dist/`.
- `npm test`: Run the full Jest suite.
- `npm run test:unit` / `npm run test:integration`: Focused test runs.
- `npm run lint`: Run ESLint (if configured/extended).
- `npm run clean`: Remove `dist/`.

## Coding Style & Naming Conventions
- TypeScript, ES modules, semicolons, 2-space indentation.
- Use `.js` extensions in TS import paths (matches ESM output).
- Tools follow `*Tool`, `*Schema`, and `execute*` exports (e.g., `search_domain.ts`).
- Use `camelCase` for functions, `PascalCase` for types/interfaces, kebab-case filenames.

## Testing Guidelines
- Framework: Jest (`jest.config.js`).
- Test files are `*.test.ts` under `tests/`.
- Run a single test file: `npx jest tests/unit/cache.test.ts`.
- Prefer deterministic unit tests; integration tests can hit real adapters when configured.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (e.g., `feat:`, `fix:`, `docs:`).
- PRs should include a clear summary, test evidence (command + result), and links to related issues.
- If behavior changes user-facing output, include examples or screenshots in the PR.

## Configuration & Security Tips
- Use `.env` for secrets; required keys live in `README.md` and `docs/CONFIGURATION.md`.
- Never commit `.mcpregistry_*` token files or API keys.
- Without keys, availability falls back to RDAP/WHOIS; pricing is null.
- GoDaddy public endpoint is used only for premium/auction signals in `search_domain`.
