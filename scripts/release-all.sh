#!/bin/bash
#
# release-all.sh - Unified release script for svg-matrix
#
# This script bumps versions, tags, and pushes both:
#   - @emasoft/svg-matrix (npm)
#   - svg-matrix (PyPI)
#
# Usage:
#   ./scripts/release-all.sh patch   # 1.3.6 -> 1.3.7
#   ./scripts/release-all.sh minor   # 1.3.6 -> 1.4.0
#   ./scripts/release-all.sh major   # 1.3.6 -> 2.0.0
#   ./scripts/release-all.sh 1.4.0   # Set specific version
#
# The script will:
#   1. Validate both repos are clean
#   2. Bump version in npm package (package.json + all VERSION constants)
#   3. Bump version in Python wrapper (pyproject.toml + __init__.py)
#   4. Commit changes
#   5. Create tags (vX.Y.Z)
#   6. Push to GitHub (triggers CI/CD for npm and PyPI publishing)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory (main repo root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PYTHON_WRAPPER="$REPO_ROOT/python-wrapper"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  svg-matrix Unified Release Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check argument
if [ -z "$1" ]; then
    echo -e "${RED}Error: Version bump type required${NC}"
    echo ""
    echo "Usage: $0 <patch|minor|major|X.Y.Z>"
    echo ""
    echo "Examples:"
    echo "  $0 patch    # 1.3.6 -> 1.3.7"
    echo "  $0 minor    # 1.3.6 -> 1.4.0"
    echo "  $0 major    # 1.3.6 -> 2.0.0"
    echo "  $0 1.4.0    # Set specific version"
    exit 1
fi

BUMP_TYPE="$1"

# Get current versions
cd "$REPO_ROOT"
CURRENT_NPM_VERSION=$(node -p "require('./package.json').version")
CURRENT_PYPI_VERSION=$(grep 'version = ' "$PYTHON_WRAPPER/pyproject.toml" | head -1 | sed 's/version = "\(.*\)"/\1/')

echo -e "${YELLOW}Current versions:${NC}"
echo "  npm (package.json):     $CURRENT_NPM_VERSION"
echo "  PyPI (pyproject.toml):  $CURRENT_PYPI_VERSION"
echo ""

# Calculate new version
if [[ "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # Specific version provided
    NEW_VERSION="$BUMP_TYPE"
else
    # Calculate from current npm version
    IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_NPM_VERSION"
    MAJOR="${VERSION_PARTS[0]}"
    MINOR="${VERSION_PARTS[1]}"
    PATCH="${VERSION_PARTS[2]}"

    case "$BUMP_TYPE" in
        patch)
            PATCH=$((PATCH + 1))
            ;;
        minor)
            MINOR=$((MINOR + 1))
            PATCH=0
            ;;
        major)
            MAJOR=$((MAJOR + 1))
            MINOR=0
            PATCH=0
            ;;
        *)
            echo -e "${RED}Error: Invalid bump type '$BUMP_TYPE'${NC}"
            echo "Use: patch, minor, major, or X.Y.Z"
            exit 1
            ;;
    esac
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi

echo -e "${GREEN}New version: $NEW_VERSION${NC}"
echo ""

# Confirm
read -p "Proceed with release v$NEW_VERSION? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Aborted.${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}Step 1: Checking for uncommitted changes...${NC}"

# Check main repo
cd "$REPO_ROOT"
if ! git diff --quiet || ! git diff --staged --quiet; then
    echo -e "${RED}Error: Main repo has uncommitted changes${NC}"
    git status --short
    exit 1
fi
echo "  ✓ Main repo is clean"

# Check python-wrapper
cd "$PYTHON_WRAPPER"
if ! git diff --quiet || ! git diff --staged --quiet; then
    echo -e "${RED}Error: Python wrapper has uncommitted changes${NC}"
    git status --short
    exit 1
fi
echo "  ✓ Python wrapper is clean"

echo ""
echo -e "${BLUE}Step 2: Bumping npm package version...${NC}"
cd "$REPO_ROOT"

# Update package.json
npm version "$NEW_VERSION" --no-git-tag-version
echo "  ✓ package.json updated"

# Sync VERSION constants in source files
node scripts/version-sync.js
echo "  ✓ VERSION constants synced"

# Rebuild dist
npm run build
echo "  ✓ dist/ rebuilt"

echo ""
echo -e "${BLUE}Step 3: Bumping Python wrapper version...${NC}"
cd "$PYTHON_WRAPPER"

# Update pyproject.toml
sed -i '' "s/version = \".*\"/version = \"$NEW_VERSION\"/" pyproject.toml
echo "  ✓ pyproject.toml updated"

# Update __init__.py
sed -i '' "s/__version__ = \".*\"/__version__ = \"$NEW_VERSION\"/" src/svg_matrix/__init__.py
echo "  ✓ __init__.py updated"

echo ""
echo -e "${BLUE}Step 4: Committing changes...${NC}"

# Commit Python wrapper first
cd "$PYTHON_WRAPPER"
git add -A
git commit -m "chore: bump version to $NEW_VERSION"
echo "  ✓ Python wrapper committed"

# Commit main repo (includes submodule update)
cd "$REPO_ROOT"
git add -A
git commit -m "chore: bump version to $NEW_VERSION"
echo "  ✓ Main repo committed"

echo ""
echo -e "${BLUE}Step 5: Creating tags...${NC}"

# Tag Python wrapper
cd "$PYTHON_WRAPPER"
git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION"
echo "  ✓ Python wrapper tagged v$NEW_VERSION"

# Tag main repo
cd "$REPO_ROOT"
git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION"
echo "  ✓ Main repo tagged v$NEW_VERSION"

echo ""
echo -e "${BLUE}Step 6: Pushing to GitHub...${NC}"

# Push Python wrapper (triggers PyPI publish)
cd "$PYTHON_WRAPPER"
git push origin main --tags
echo "  ✓ Python wrapper pushed (PyPI publish triggered)"

# Push main repo (triggers npm publish)
cd "$REPO_ROOT"
git push origin main --tags
echo "  ✓ Main repo pushed (npm publish triggered)"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Release v$NEW_VERSION complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "GitHub Actions will now:"
echo "  • Publish @emasoft/svg-matrix v$NEW_VERSION to npm"
echo "  • Publish svg-matrix v$NEW_VERSION to PyPI"
echo ""
echo "Monitor progress:"
echo "  npm:  gh run list --repo Emasoft/SVG-MATRIX"
echo "  PyPI: gh run list --repo Emasoft/svg-matrix-python"
