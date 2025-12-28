# Repository Guidelines

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
