# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

svg-matrix is an arbitrary-precision matrix, vector, and affine transformation library for JavaScript using decimal.js. It provides Decimal-backed Matrix and Vector classes along with 2D (3x3) and 3D (4x4) transform helpers for geometry operations requiring high precision.

## Commands

```bash
# Install dependencies
npm install

# Run tests (executes test/examples.js)
npm test

# CI test (clean install + test)
npm run ci-test
```

## Architecture

### Core Classes (src/)

**Matrix** (`matrix.js`) - Decimal-backed matrix class with:
- Factory methods: `Matrix.from()`, `Matrix.zeros()`, `Matrix.identity()`
- Operations: `add()`, `sub()`, `mul()`, `transpose()`, `inverse()`, `clone()`
- Linear algebra: `lu()` (LU decomposition), `qr()` (QR via Householder), `determinant()`, `solve()`, `exp()` (matrix exponential)
- Vector application: `applyToVector()`

**Vector** (`vector.js`) - Decimal-backed vector class with:
- Basic ops: `add()`, `sub()`, `scale()`, `dot()`, `cross()`, `outer()`
- Geometry: `norm()`, `normalize()`, `angleBetween()`, `projectOnto()`, `orthogonal()`
- Conversion: `toArray()`, `toNumberArray()`, `toStringArray()`

### Transform Helpers

**Transforms2D** (`transforms2d.js`) - 3x3 affine matrices:
- `translation(tx, ty)`, `scale(sx, sy)`, `rotate(theta)`, `rotateAroundPoint()`, `skew()`, `stretchAlongAxis()`
- `applyTransform(M, x, y)` - applies matrix to 2D point with homogeneous division

**Transforms3D** (`transforms3d.js`) - 4x4 affine matrices:
- `translation(tx, ty, tz)`, `scale(sx, sy, sz)`, `rotateAroundAxis(ux, uy, uz, theta)`

### Key Patterns

All numeric inputs are converted to Decimal via the helper `const D = x => (x instanceof Decimal ? x : new Decimal(x))`. This allows passing numbers, strings, or Decimal instances.

Transform composition uses right-to-left multiplication: `T.mul(R).mul(S)` applies S first, then R, then T.

## Dependencies

- **decimal.js** (^11.4.3) - Arbitrary-precision decimal arithmetic (runtime)
- **@actions/oidc-client** - GitHub Actions OIDC for npm publishing (dev)
- **node-fetch** - For npm token retrieval scripts (dev)

## Publishing

Releases are triggered by pushing version tags (`v*`). The publish workflow uses npm OIDC trusted publishing (Node 24 / npm 11.6+).
