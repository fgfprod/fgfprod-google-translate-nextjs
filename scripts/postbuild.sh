#!/bin/sh
set -e
cd "$(dirname "$0")/.."
cp styles.css dist/styles.css
tmp=$(mktemp)
{ printf '%s\n' '"use client";' ; cat dist/index.js; } > "$tmp"
mv "$tmp" dist/index.js
