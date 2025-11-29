#!/usr/bin/env bash
set -euo pipefail

# bootstrap_repo.sh
# Creates a new repository (owner/repo), populates it with SVG-MATRIX files,
# commits and pushes initial branch, and optionally sets OIDC secrets.
#
# Requirements:
#  - gh CLI authenticated (gh auth status)
#  - git installed
#  - node/npm not required to run script (only to run tests later)
#
# Usage:
#   OWNER=Emasoft REPO=SVG-MATRIX ./bootstrap_repo.sh
# Optional env vars:
#   VISIBILITY (public|private) default: public
#   BRANCH default: main
#   NPM_OIDC_TOKEN_URL and NPM_OIDC_AUDIENCE - optional secrets to set in the repo (if provided they'll be added)

OWNER="${OWNER:-Emasoft}"
REPO="${REPO:-SVG-MATRIX}"
VISIBILITY="${VISIBILITY:-public}"
BRANCH="${BRANCH:-main}"
DIR="${REPO}"

echo "Bootstrap repo: ${OWNER}/${REPO} (visibility=${VISIBILITY}, branch=${BRANCH})"

# check prerequisites
if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install and authenticate (gh auth login) and try again."
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git not found. Please install git and try again."
  exit 1
fi

# check gh auth
if ! gh auth status >/dev/null 2>&1; then
  echo "gh CLI not authenticated. Run: gh auth login"
  gh auth status || true
  exit 1
fi

# create local dir (safe)
if [ -d "${DIR}" ]; then
  echo "Directory ${DIR} already exists. Please remove or move it and re-run, or run in a different location."
  exit 1
fi

mkdir "${DIR}"
cd "${DIR}"

# create files (each file is written with a here-doc)
mkdir -p src test .github/workflows scripts

cat > .gitignore <<'EOF'
node_modules
dist
.DS_Store
.env
EOF

cat > package.json <<'EOF'
{
  "name": "svg-matrix",
  "version": "1.0.0",
  "description": "Arbitrary-precision matrix, vector and affine transformation library for JavaScript using decimal.js",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "test": "node test/examples.js",
    "ci-test": "npm ci && npm test",
    "prepublishOnly": "npm test"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/Emasoft/SVG-MATRIX.git"
  },
  "keywords": [
    "matrix",
    "vector",
    "arbitrary-precision",
    "decimal",
    "linear-algebra",
    "affine",
    "transform",
    "svg",
    "geometry"
  ],
  "author": "Emasoft",
  "license": "MIT",
  "dependencies": {
    "decimal.js": "^11.4.3"
  },
  "devDependencies": {}
}
EOF

