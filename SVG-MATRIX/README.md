# SVG-MATRIX

Arbitrary-precision matrix, vector and affine transformation library for JavaScript using decimal.js.

This repository contains:
- Decimal-backed Matrix and Vector classes.
- 2D (3x3) and 3D (4x4) transform helpers.
- Examples and GitHub Actions workflows:
  - .github/workflows/test.yml  => runs tests/examples on push/PR
  - .github/workflows/publish.yml => publishes to npm via OIDC trusted publishing on tag push

Install
  npm ci

Usage example:
```js
import { Decimal, Matrix, Vector, Transforms2D } from 'svg-matrix';
Decimal.set({ precision: 80 });

const M = Transforms2D.translation(2, 3).mul(Transforms2D.rotate(Math.PI/4)).mul(Transforms2D.scale(1.5));
const p2 = Transforms2D.applyTransform(M, 1, 0);
console.log('Transformed point:', p2.map(x => x.toString()));
