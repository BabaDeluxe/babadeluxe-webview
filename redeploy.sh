#!/bin/bash
pm2 stop babadeluxe-webview-auto-deploy 2>/dev/null || true
pm2 delete babadeluxe-webview-auto-deploy 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 logs babadeluxe-webview-auto-deploy
