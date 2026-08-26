#!/bin/zsh
set -euo pipefail

# Rebuild localized pages first, then copy the web app into the Xcode bundle.
cd "$(dirname "$0")/../../.."
node build-i18n.js
mkdir -p ios/WangDoKu/WangDoKu/Resources/Web
rsync -a --delete --delete-excluded \
  --exclude '.git' \
  --exclude 'ios' \
  --exclude 'node_modules' \
  --exclude '.netlify' \
  --exclude '*.zip' \
  --exclude '.DS_Store' \
  ./ ios/WangDoKu/WangDoKu/Resources/Web/
