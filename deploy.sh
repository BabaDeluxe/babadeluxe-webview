#!/usr/bin/env bash
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
    # skip comments and blank lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    # skip lines without '='
    [[ "$line" != *"="* ]] && continue

    # split at first '='
    key="${line%%=*}"
    value="${line#*=}"

    # trim spaces around key
    key="$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

    # skip invalid keys
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

# interval in ms from env, default 5 minutes
DEPLOY_CHECK_INTERVAL_MS="${DEPLOY_CHECK_INTERVAL_MS:-300000}"
DEPLOY_INTERVAL_SECONDS=$((DEPLOY_CHECK_INTERVAL_MS / 1000))

# Vite outDir is 'dist' in vite.config.ts
BUILD_DIR="${BUILD_DIR:-dist}"

# branches (auto-discovery with env override)
# prefer explicit env vars; otherwise infer default main branch name
DEFAULT_PROD_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo 'master')"

STAGING_BRANCH="${STAGING_BRANCH:-dev}"
PROD_BRANCH="${PROD_BRANCH:-$DEFAULT_PROD_BRANCH}"

# docroots (adjust to your real Plesk paths)
STAGING_DOCROOT="${STAGING_DOCROOT:-/var/www/vhosts/babadeluxe.com/webview-staging.babadeluxe.com}"
PROD_DOCROOT="${PROD_DOCROOT:-/var/www/vhosts/babadeluxe.com/webview.babadeluxe.com}"

deploy_one() {
  local name="$1"     # "staging" | "production"
  local branch="$2"
  local target

  if [ "$name" = "staging" ]; then
    target="${STAGING_DOCROOT}"
  else
    target="${PROD_DOCROOT}"
  fi

  log "[webview:${name}] checking for changes on branch '${branch}'..."

  # preserve local hacks: abort if dirty
  if [ -n "$(git status --porcelain)" ]; then
    log "[webview:${name}] deploy aborted: working tree is dirty in ${SCRIPT_DIR}"
    return 1
  fi

  git fetch origin

  local local_ref remote_ref
  local_ref="$(git rev-parse HEAD)"
  remote_ref="$(git rev-parse "origin/${branch}")"

  if [ "$local_ref" = "$remote_ref" ]; then
    log "[webview:${name}] up to date"
    return 0
  fi

  log "[webview:${name}] changes detected, deploying..."

  git pull --ff-only origin "${branch}"

  npm ci
  npm run build

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

