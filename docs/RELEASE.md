# Release Workflow

Releases are published only by the tag-triggered GitHub Actions workflow. Never
run `npm publish` or change npm dist-tags from a local machine.

## Prepare the release

1. Bump the version in `package.json`, `package-lock.json`, and `server.json`.
2. Add the release section to `CHANGELOG.md`.
3. Run the full test suite and build.
4. Inspect `npm pack --dry-run` and verify that no secrets or local-only files
   enter the package.
5. Open a focused, non-draft pull request and wait for CI and review.
6. Merge the pull request before creating the version tag.

## Publish through GitHub Actions

After the release commit is present on `main`, create and push the matching tag:

```bash
git switch main
git pull --ff-only
git tag v1.13.1
git push origin v1.13.1
```

The release workflow uses npm trusted publishing through GitHub OIDC. It does
not use an `NPM_TOKEN`. The workflow builds the package, publishes it with
provenance, updates the MCP Registry, and publishes the drafted GitHub release.

After the workflow completes, verify:

- the workflow is green;
- npm shows the expected version and provenance;
- the GitHub release points to the expected tag and commit;
- the MCP Registry shows the expected version.

## Release Drafter Labels

Use these labels so release notes are auto-generated cleanly:

- `breaking`
- `feature`, `enhancement`
- `fix`, `bug`
- `docs`
- `chore`, `refactor`
- `security`

Use `skip-changelog` to exclude a PR from release notes.

## Notes

- CI publishes with `--provenance` for supply-chain integrity.
- Never publish locally, even for canary builds.
- If a release is bad, use `npm deprecate` and promote the previous version.
