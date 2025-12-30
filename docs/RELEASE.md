# Release Workflow

Use this flow to publish safely and keep MCP clients stable.

## Checklist

- Bump versions in `package.json`, `package-lock.json`, and `server.json`.
- Run `npm run test` (or at least `npm run build`).
- Confirm no secrets are included in the package (`npm pack --dry-run` if needed).

## Canary Publish

Publish a canary build for quick validation:

```bash
npm run release:canary
```

Smoke test the canary in a local MCP client. If it behaves correctly, promote it.

## Promote to Latest

```bash
npm run release:promote-latest
```

Or publish directly as latest:

```bash
npm run release:latest
```

## Notes

- All publish scripts use `--provenance` for supply-chain integrity.
- Prefer canary first for risky changes (protocol updates, new tool outputs).
- If a release is bad, use `npm deprecate` and promote the previous version.
