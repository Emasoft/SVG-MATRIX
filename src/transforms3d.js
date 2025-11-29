import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';
const D = x => (x instanceof Decimal ? x : new Decimal(x));

export function translation(tx, ty, tz) {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0), D(tx)],
    [new Decimal(0), new Decimal(1), new Decimal(0), D(ty)],
    [new Decimal(0), new Decimal(0), new Decimal(1), D(tz)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

export function scale(sx, sy = null, sz = null) {
  if (sy === null) sy = sx;
  if (sz === null) sz = sx;
  return Matrix.from([
    [D(sx), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), D(sy), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), D(sz), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

// rotation around arbitrary axis (ux,uy,uz) through origin by angle theta (radians)
export function rotateAroundAxis(ux, uy, uz, theta) {
  const u = [D(ux), D(uy), D(uz)];
  let norm = u[0].mul(u[0]).plus(u[1].mul(u[1])).plus(u[2].mul(u[2])).sqrt();
  if (norm.isZero()) throw new Error('Rotation axis cannot be zero');
  u[0] = u[0].div(norm); u[1] = u[1].div(norm); u[2] = u[2].div(norm);
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  const one = new Decimal(1);
  const ux2 = u[0].mul(u[0]), uy2 = u[1].mul(u[1]), uz2 = u[2].mul(u[2]);
  const m00 = ux2.plus(c.mul(one.minus(ux2)));
  const m01 = u[0].mul(u[1]).mul(one.minus(c)).minus(u[2].mul(s));
  const m02 = u[0].mul(u[2]).mul(one.minus(c)).plus(u[1].mul(s));
  const m10 = u[1].mul(u[0]).mul(one.minus(c)).plus(u[2].mul(s));
  const m11 = uy2.plus(c.mul(one.minus(uy2)));
  const m12 = u[1].mul(u[2]).mul(one.minus(c)).minus(u[0].mul(s));
  const m20 = u[2].mul(u[0]).mul(one.minus(c)).minus(u[1].mul(s));
  const m21 = u[2].mul(u[1]).mul(one.minus(c)).plus(u[0].mul(s));
  const m22 = uz2.plus(c.mul(one.minus(uz2)));
  return Matrix.from([
    [m00, m01, m02, new Decimal(0)],
    [m10, m11, m12, new Decimal(0)],
    [m20, m21, m22, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}