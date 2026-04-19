#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

log() {
  local ts
  ts="$(date '+%d-%m-%Y %H:%M:%S')"
  echo "[$ts] $1"
}

# --- load .env: first '=' per line, export rest as value ---
if [ -f ".env" ]; then
  log "Loading .env from ${SCRIPT_DIR}"

  LOADED_KEYS=()

  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" != *"="* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"
    key="$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

    [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && continue

    export "$key=$value"
    LOADED_KEYS+=("$key")
  done < ".env"

  if ((${#LOADED_KEYS[@]})); then
    log "Loaded .env keys: ${LOADED_KEYS[*]}"
  else
    log ".env had no valid KEY=VALUE lines"
  fi
else
  log ".env not found in ${SCRIPT_DIR}"
fi

DEPLOY_CHECK_INTERVAL_MS="${DEPLOY_CHECK_INTERVAL_MS:-300000}"
DEPLOY_INTERVAL_SECONDS=$((DEPLOY_CHECK_INTERVAL_MS / 1000))

BUILD_DIR="${BUILD_DIR:-dist}"

DEFAULT_PROD_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo 'master')"

STAGING_BRANCH="${STAGING_BRANCH:-dev}"
PROD_BRANCH="${PROD_BRANCH:-$DEFAULT_PROD_BRANCH}"

STAGING_DOCROOT="${STAGING_DOCROOT:-/var/www/vhosts/babadeluxe.com/webview-staging.babadeluxe.com}"
PROD_DOCROOT="${PROD_DOCROOT:-/var/www/vhosts/babadeluxe.com/webview.babadeluxe.com}"

deploy_one() {
  local name="$1"
  local branch="$2"
  local target

  if [ "$name" = "staging" ]; then
    target="${STAGING_DOCROOT}"
  else
    target="${PROD_DOCROOT}"
  fi

  log "[webview:${name}] checking for changes on branch '${branch}'..."

  DIRTY="$(git status --porcelain)"
  if [ -n "$DIRTY" ]; then
    log "[${name}] deploy BLOCKED: working tree is dirty in ${SCRIPT_DIR}"
    log "[${name}] dirty files:"
    while IFS= read -r dirty_line; do
      log "[${name}]   $dirty_line"
    done <<< "$DIRTY"
    return 1
  fi

  git fetch origin

  log "[webview:${name}] changes detected, deploying..."

  git pull --ff-only origin "${branch}"

  pnpm install --frozen-lockfile
  pnpm build

  mkdir -p "${target}"
  rsync -a --delete "${SCRIPT_DIR}/${BUILD_DIR}/" "${target}/"

  log "[webview:${name}] deploy done → ${target}"
}

run_cycle() {
  deploy_one "staging" "${STAGING_BRANCH}" || true
  deploy_one "production" "${PROD_BRANCH}" || true
}

log "Starting BabaDeluxe webview auto-deploy loop from ${SCRIPT_DIR}, interval ${DEPLOY_INTERVAL_SECONDS}s, build dir '${BUILD_DIR}'"
log "Staging → branch '${STAGING_BRANCH}' → ${STAGING_DOCROOT}"
log "Production → branch '${PROD_BRANCH}' → ${PROD_DOCROOT}"

while true; do
  run_cycle
  sleep "${DEPLOY_INTERVAL_SECONDS}"
done
