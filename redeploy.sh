#!/usr/bin/env bash
set -euo pipefail

pm2 stop babadeluxe-backend-auto-deploy 2>/dev/null || true
pm2 delete babadeluxe-backend-auto-deploy 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 logs babadeluxe-backend-auto-deploy
