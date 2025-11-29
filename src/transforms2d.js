import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';
const D = x => (x instanceof Decimal ? x : new Decimal(x));

export function translation(tx, ty) {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), D(tx)],
    [new Decimal(0), new Decimal(1), D(ty)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

export function scale(sx, sy = null) {
  if (sy === null) sy = sx;
  return Matrix.from([
    [D(sx), new Decimal(0), new Decimal(0)],
    [new Decimal(0), D(sy), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

export function rotate(theta) {
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  return Matrix.from([
    [c, s.negated(), new Decimal(0)],
    [s, c, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

export function rotateAroundPoint(theta, px, py) {
  return translation(px, py).mul(rotate(theta)).mul(translation(new Decimal(px).neg(), new Decimal(py).neg()));
}

export function skew(ax, ay) {
  return Matrix.from([
    [new Decimal(1), D(ax), new Decimal(0)],
    [D(ay), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

export function stretchAlongAxis(ux, uy, k) {
  const uxD = D(ux), uyD = D(uy), kD = D(k);
  const one = new Decimal(1);
  const factor = kD.minus(one);
  const m00 = one.plus(factor.mul(uxD.mul(uxD)));
  const m01 = factor.mul(uxD.mul(uyD));
  const m10 = factor.mul(uyD.mul(uxD));
  const m11 = one.plus(factor.mul(uyD.mul(uyD)));
  return Matrix.from([
    [m00, m01, new Decimal(0)],
    [m10, m11, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

export function applyTransform(M, x, y) {
  const P = Matrix.from([[D(x)], [D(y)], [new Decimal(1)]]);
  const R = M.mul(P);
  const rx = R.data[0][0], ry = R.data[1][0], rw = R.data[2][0];
  return [rx.div(rw), ry.div(rw)];
}