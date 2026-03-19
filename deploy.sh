#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}" && pwd)"
echo "PROJECT_ROOT: ${PROJECT_ROOT}"
cd "${PROJECT_ROOT}"

# load env
LOADED_ENV_KEYS=""

if [ -f ".env" ]; then
  # collect keys before loading
  BEFORE_KEYS=$(compgen -v)

  set -a
  # shellcheck disable=SC1091
  source .env
  set +a

  # collect keys after loading
  AFTER_KEYS=$(compgen -v)

  # diff: vars that appeared after sourcing .env
  LOADED_ENV_KEYS=$(comm -13 <(printf '%s\n' "$BEFORE_KEYS" | sort) \
                          <(printf '%s\n' "$AFTER_KEYS" | sort))
fi

log() {
  local ts
  ts="$(date '+%d-%m-%Y %H:%M:%S')"
  echo "[$ts] $1"
}

# log env keys initially
if [ -n "$LOADED_ENV_KEYS" ]; then
  log "Loaded .env keys: $(echo "$LOADED_ENV_KEYS" | tr '\n' ' ')"
else
  log "No .env file found or no new keys loaded"
fi

# interval in ms from env, default 5 minutes
DEPLOY_CHECK_INTERVAL_MS="${DEPLOY_CHECK_INTERVAL_MS:-300000}"
DEPLOY_INTERVAL_SECONDS=$((DEPLOY_CHECK_INTERVAL_MS / 1000))

# Vite outDir is 'dist' in vite.config.ts
BUILD_DIR="${BUILD_DIR:-dist}"

# branches
STAGING_BRANCH="${STAGING_BRANCH:-dev}"
PROD_BRANCH="${PROD_BRANCH:-master}"

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
    log "[webview:${name}] deploy aborted: working tree is dirty in ${PROJECT_ROOT}"
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
  rsync -a --delete "${PROJECT_ROOT}/${BUILD_DIR}/" "${target}/"

  log "[webview:${name}] deploy done → ${target}"
}

run_cycle() {
  deploy_one "staging" "${STAGING_BRANCH}" || true
  deploy_one "production" "${PROD_BRANCH}" || true
}

log "Starting BabaDeluxe webview auto-deploy loop from ${PROJECT_ROOT}, interval ${DEPLOY_INTERVAL_SECONDS}s, build dir '${BUILD_DIR}'"
log "Staging → branch '${STAGING_BRANCH}' → ${STAGING_DOCROOT}"
log "Production → branch '${PROD_BRANCH}' → ${PROD_DOCROOT}"

while true; do
  run_cycle
  sleep "${DEPLOY_INTERVAL_SECONDS}"
done

