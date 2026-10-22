#!/bin/sh
# Makes the Chrome Web Store upload: dist/deadline-tracker-<version>.zip
# Only the files listed here go in. test-pages/ (personal data), tests/, and the
# notes files are never included.
set -e
cd "$(dirname "$0")"
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
files="manifest.json background.js refresh.js reader.js lib.js look.js timefield.js sync.js
  panel.html panel.css panel.js options.html options.js
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png"
mkdir -p dist
out="dist/deadline-tracker-$version.zip"
rm -f "$out"
zip -q -X "$out" $files
echo "Made $out:"
unzip -l "$out"
