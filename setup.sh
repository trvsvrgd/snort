#!/usr/bin/env bash
set -euo pipefail

echo "Installing dependencies..."
npm install

echo "Starting dev (server + web)..."
npm run dev

