import Decimal from 'decimal.js';
const D = x => (x instanceof Decimal ? x : new Decimal(x));

export class Vector {
  constructor(components) {
    if (!Array.isArray(components)) throw new Error('Vector requires array');
    this.data = components.map(c => D(c));
    this.length = this.data.length;
  }

  static from(arr) {
    return new Vector(arr);
  }

  clone() {
    return new Vector(this.data.map(v => new Decimal(v)));
  }

  toArray() {
    return this.data.map(v => v);
  }

  toNumberArray() {
    return this.data.map(v => v.toNumber());
  }

  toStringArray() {
    return this.data.map(v => v.toString());
  }

  // elementwise add/sub
  add(other) {
    if (!(other instanceof Vector)) throw new Error('add expects Vector');
    if (other.length !== this.length) throw new Error('shape mismatch');
    return new Vector(this.data.map((v, i) => v.plus(other.data[i])));
  }

  sub(other) {
    if (!(other instanceof Vector)) throw new Error('sub expects Vector');
    if (other.length !== this.length) throw new Error('shape mismatch');
    return new Vector(this.data.map((v, i) => v.minus(other.data[i])));
  }

  // scalar multiplication
  scale(scalar) {
    const s = D(scalar);
    return new Vector(this.data.map(v => v.mul(s)));
  }

  // dot product
  dot(other) {
    if (!(other instanceof Vector)) throw new Error('dot expects Vector');
    if (other.length !== this.length) throw new Error('shape mismatch');
    return this.data.reduce((acc, v, i) => acc.plus(v.mul(other.data[i])), new Decimal(0));
  }

  // outer / tensor product returns Matrix-like 2D array (Decimal)
  outer(other) {
    if (!(other instanceof Vector)) throw new Error('outer expects Vector');
    const rows = this.length, cols = other.length;
    const out = Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (_, j) => this.data[i].mul(other.data[j]))
    );
    return out;
  }

  // cross product for 3D vectors
  cross(other) {
    if (this.length !== 3 || other.length !== 3) throw new Error('cross requires 3D vectors');
    const [a1, a2, a3] = this.data;
    const [b1, b2, b3] = other.data;
    return new Vector([
      a2.mul(b3).minus(a3.mul(b2)),
      a3.mul(b1).minus(a1.mul(b3)),
      a1.mul(b2).minus(a2.mul(b1))
    ]);
  }

  // norm (Euclidean)
  norm() {
    let sum = new Decimal(0);
    for (const v of this.data) sum = sum.plus(v.mul(v));
    return sum.sqrt();
  }

  // normalize: returns a new Vector
  normalize() {
    const n = this.norm();
    if (n.isZero()) throw new Error('Cannot normalize zero vector');
    return this.scale(new Decimal(1).div(n));
  }

  // angle between vectors (radians)
  angleBetween(other) {
    const dot = this.dot(other);
    const n1 = this.norm();
    const n2 = other.norm();
    if (n1.isZero() || n2.isZero()) throw new Error('Angle with zero vector undefined');
    // clamp cosine to [-1,1] for numerical safety
    let cosv = dot.div(n1.mul(n2));
    // toNumber clamping fallback:
    const cosNum = cosv.toNumber();
    const clamped = Math.min(1, Math.max(-1, cosNum));
    return new Decimal(Math.acos(clamped));
  }

  // projection of this onto other (vector)
  projectOnto(other) {
    const denom = other.dot(other);
    if (denom.isZero()) throw new Error('Cannot project onto zero vector');
    const coef = this.dot(other).div(denom);
    return other.scale(coef);
  }

  // compute an orthogonal vector (for 2D returns perpendicular; for higher dims returns Gram-Schmidt complement)
  orthogonal() {
    if (this.length === 2) {
      // perp: [-y, x]
      return new Vector([this.data[1].negated(), this.data[0]]);
    }
    // for n>2: find a vector not colinear with this and make orthogonal via Gram-Schmidt with standard basis
    for (let i = 0; i < this.length; i++) {
      const ei = Array.from({ length: this.length }, (_, j) => new Decimal(j === i ? 1 : 0));
      let candidate = new Vector(ei);
      // check not parallel
      const crossDim = Math.min(3, this.length);
      // project candidate out of this
      const proj = candidate.projectOnto(this);
      const orth = candidate.sub(proj);
      const norm = orth.norm();
      if (!norm.isZero()) return orth.normalize();
    }
    throw new Error('Unable to find orthogonal vector');
  }

  // check orthogonality with other
  isOrthogonalTo(other) {
    return this.dot(other).isZero();
  }
}