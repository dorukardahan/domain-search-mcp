#!/usr/bin/env bash
set -euo pipefail
version=8.30.1
archive=gitleaks_${version}_linux_x64.tar.gz
expected=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Unsupported Gitleaks platform'; exit 1; }
target=${1:?usage: install-gitleaks.sh BIN_DIRECTORY}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
url=https://github.com/gitleaks/gitleaks/releases/download/v${version}
curl --fail --silent --show-error --location "$url/$archive" -o "$work/$archive"
curl --fail --silent --show-error --location "$url/gitleaks_${version}_checksums.txt" -o "$work/checksums.txt"
(cd "$work" && printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --status)
awk -v name="$archive" -v hash="$expected" '$2==name && $1==hash {ok=1} END {exit !ok}' "$work/checksums.txt"
tar -xzf "$work/$archive" -C "$work" gitleaks
mkdir -p "$target"
install -m 755 "$work/gitleaks" "$target/gitleaks"
"$target/gitleaks" version
