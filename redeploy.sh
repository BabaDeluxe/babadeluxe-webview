#!/usr/bin/env bash
pm2 stop babadeluxe-webview-auto-deploy || true
pm2 delete babadeluxe-webview-auto-deploy || true
pm2 start ecosystem.config.js
pm2 logs babadeluxe-webview-auto-deploy
