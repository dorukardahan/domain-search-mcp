# Release and secret controls

`release.py` is the only upload entry. Local execution is prepare-only.
It clones a clean, fixed commit, verifies the repository identity, compares the
real package against an exact file allowlist, scans content, and records a digest.
CI uploads that exact checked artifact, never a new pack. Scanner errors fail closed.

Automatic npm releases for the two TwitterAPI packages retain their main push
trigger and do not need per-version owner approval. Gate failure stops upload and
opens an owner notification. Never bypass a blocked gate; owner review is required.
Manual npm and ClawHub uploads run only in the `owner-approved-release` environment;
configure a required owner reviewer before enabling the workflow. The artifact
manifest is prepared before approval. The environment marker is not itself an
authorization boundary: GitHub environment protection and credential separation are.

Use `python3 scripts/security/release.py prepare --package PACKAGE --output OUTSIDE_CHECKOUT`
(add `--clawhub-root PATH` for ClawHub). Review manifest.json and its digest.
Do not run npm/clawhub publish directly. Do not publish from a workspace.

`secret_guard.py staged` scans full staged blobs, not unstaged worktree content.
`secret_guard.py message FILE` scans commit messages. `test_guards.py` generates
synthetic fixtures at runtime; never use real credentials in tests.

The scanner is Gitleaks 8.30.1 from its official release, with a pinned SHA-256
and official checksum comparison. Only filenames, line numbers and rule IDs are
reported. Do not store password/key/token/private-key/seed values in memory,
notes, reports or commits (including temporary or chat-supplied credentials).
Use a secret-store reference. Stop on suspected leaks; do not test or rotate them.

Hooks are bypassable and pattern detectors cannot identify every arbitrary
password. These controls do not claim universal secret detection or enforce
branch protection. No branch protection is needed for daily main pushes.
