# Release Workflow

Use this flow to publish safely and keep MCP clients stable.

## Checklist

- Bump versions in `package.json`, `package-lock.json`, and `server.json`.
- Run `npm run test` (or at least `npm run build`).
- Ensure GitHub secret `NPM_TOKEN` is set (used by CI).
- Confirm no secrets are included in the package (`npm pack --dry-run` if needed).

## Canary Publish (Local)

Publish a canary build for quick validation:

```bash
npm run release:canary
```

Smoke test the canary in a local MCP client. If it behaves correctly, promote it.

## Promote to Latest (Local)

```bash
npm run release:promote-latest
```

Or publish directly as latest:

```bash
npm run release:latest
```

## CI Release (Recommended)

Create a git tag and push it. CI will publish with provenance and create a GitHub Release:

```bash
git tag v1.2.24
git push origin v1.2.24
```

## Notes

- CI publishes with `--provenance` for supply-chain integrity.
- Local scripts use `--provenance` if supported; otherwise publish without provenance.
- Prefer canary first for risky changes (protocol updates, new tool outputs).
- If a release is bad, use `npm deprecate` and promote the previous version.
