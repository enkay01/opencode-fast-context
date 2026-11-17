#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
main="$(dirname "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)")"
secrets="$main/scripts/validation/.env.local"

case "${1:---mock}" in
  --init-keys)
    mkdir -p "$(dirname "$secrets")"
    if [[ ! -e "$secrets" ]]; then
      (umask 077; set -o noclobber; printf 'TYPESAFE_API_KEY=\nGEMINI_API_KEY=\n' > "$secrets")
    fi
    printf '%s\n' "$secrets"
    exit ;;
  --mock|--mock-env|--live) mode="${1:---mock}" ;;
  *) printf 'Usage: bash scripts/validate-tui.sh [--mock | --mock-env | --live | --init-keys]\n' >&2; exit 2 ;;
esac

cd "$repo"
run_varlock() {
  env -u TYPESAFE_API_KEY -u GEMINI_API_KEY -u __VARLOCK_ENV -u _VARLOCK_USE_FROZEN_ENV \
    varlock run --path "$1/" --skip-cache --inject vars \
    --filter TYPESAFE_API_KEY,GEMINI_API_KEY -- python3 scripts/validation/tui.py "$mode"
}
if [[ "$mode" == --mock-env ]]; then
  fixture_dir="$(mktemp -d)"
  trap 'rm -rf -- "$fixture_dir"' EXIT
  cp scripts/validation/.env.schema "$fixture_dir/.env.schema"
  printf 'TYPESAFE_API_KEY=jev-test\nGEMINI_API_KEY=gemini-test\n' > "$fixture_dir/.env.local"
  run_varlock "$fixture_dir"
elif [[ "$mode" == --live ]]; then
  if [[ ! -f "$secrets" ]]; then
    printf 'Run bash scripts/validate-tui.sh --init-keys, then fill in the two keys.\n' >&2
    exit 1
  fi
  run_varlock "$main/scripts/validation"
else
  exec env -u TYPESAFE_API_KEY -u GEMINI_API_KEY -u __VARLOCK_ENV python3 scripts/validation/tui.py --mock
fi
