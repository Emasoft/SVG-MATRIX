import Decimal from 'decimal.js';
import { Vector } from './vector.js';
const D = x => (x instanceof Decimal ? x : new Decimal(x));

/**
 * Matrix - Decimal-backed matrix class
 */
export class Matrix {
  constructor(data) {
    if (!Array.isArray(data) || data.length === 0) throw new Error('Matrix requires non-empty 2D array');
    const cols = data[0].length;
    for (const row of data) {
      if (!Array.isArray(row) || row.length !== cols) throw new Error('All rows must have same length');
    }
    this.data = data.map(r => r.map(v => D(v)));
    this.rows = data.length;
    this.cols = cols;
  }

  static from(arr) {
    return new Matrix(arr);
  }

  static zeros(r, c) {
    const out = Array.from({ length: r }, () => Array.from({ length: c }, () => new Decimal(0)));
    return new Matrix(out);
  }

  static identity(n) {
    const out = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? new Decimal(1) : new Decimal(0))));
    return new Matrix(out);
  }

  clone() {
    return new Matrix(this.data.map(r => r.map(v => new Decimal(v))));
  }

  toArrayOfStrings() {
    return this.data.map(r => r.map(v => v.toString()));
  }

  // apply matrix to Vector or array: returns Vector
  applyToVector(vec) {
    let v;
    if (vec instanceof Vector) v = vec;
    else if (Array.isArray(vec)) v = Vector.from(vec);
    else throw new Error('applyToVector expects Vector or array');
    if (this.cols !== v.length) throw new Error('shape mismatch');
    const out = [];
    for (let i = 0; i < this.rows; i++) {
      let sum = new Decimal(0);
      for (let j = 0; j < this.cols; j++) sum = sum.plus(this.data[i][j].mul(v.data[j]));
      out.push(sum);
    }
    return new Vector(out);
  }

  // elementwise add/sub or scalar
  add(other) {
    if (other instanceof Matrix) {
      if (this.rows !== other.rows || this.cols !== other.cols) throw new Error('shape mismatch');
      return new Matrix(this.data.map((r, i) => r.map((v, j) => v.plus(other.data[i][j]))));
    } else {
      const s = D(other);
      return new Matrix(this.data.map(r => r.map(v => v.plus(s))));
    }
  }

  sub(other) {
    if (other instanceof Matrix) {
      if (this.rows !== other.rows || this.cols !== other.cols) throw new Error('shape mismatch');
      return new Matrix(this.data.map((r, i) => r.map((v, j) => v.minus(other.data[i][j]))));
    } else {
      const s = D(other);
      return new Matrix(this.data.map(r => r.map(v => v.minus(s))));
    }
  }

  mul(other) {
    if (other instanceof Matrix) {
      if (this.cols !== other.rows) throw new Error('shape mismatch');
      const out = Array.from({ length: this.rows }, () => Array.from({ length: other.cols }, () => new Decimal(0)));
      for (let i = 0; i < this.rows; i++) {
        for (let k = 0; k < this.cols; k++) {
          const aik = this.data[i][k];
          if (aik.isZero()) continue;
          for (let j = 0; j < other.cols; j++) out[i][j] = out[i][j].plus(aik.mul(other.data[k][j]));
        }
      }
      return new Matrix(out);
    } else {
      const s = D(other);
      return new Matrix(this.data.map(r => r.map(v => v.mul(s))));
    }
  }

  transpose() {
    const out = Array.from({ length: this.cols }, (_, i) => Array.from({ length: this.rows }, (_, j) => new Decimal(this.data[j][i])));
    return new Matrix(out);
  }

  // LU decomposition (returns {L, U, P})
  lu() {
    if (this.rows !== this.cols) throw new Error('LU requires square');
    const n = this.rows;
    const A = this.clone().data.map(r => r.map(v => new Decimal(v)));
    const Pvec = Array.from({ length: n }, (_, i) => i);
    const L = Array.from({ length: n }, () => Array.from({ length: n }, () => new Decimal(0)));
    for (let i = 0; i < n; i++) L[i][i] = new Decimal(1);

    for (let k = 0; k < n; k++) {
      let pivot = k;
      let maxAbs = A[k][k].abs();
      for (let i = k + 1; i < n; i++) {
        const aabs = A[i][k].abs();
        if (aabs.greaterThan(maxAbs)) { maxAbs = aabs; pivot = i; }
      }
      if (A[pivot][k].isZero()) throw new Error('Singular matrix in LU');
      if (pivot !== k) {
        const tmp = A[k]; A[k] = A[pivot]; A[pivot] = tmp;
        const tmpIdx = Pvec[k]; Pvec[k] = Pvec[pivot]; Pvec[pivot] = tmpIdx;
        for (let j = 0; j < k; j++) {
          const t = L[k][j]; L[k][j] = L[pivot][j]; L[pivot][j] = t;
        }
      }
      for (let i = k + 1; i < n; i++) {
        const factor = A[i][k].div(A[k][k]);
        L[i][k] = factor;
        for (let j = k; j < n; j++) A[i][j] = A[i][j].minus(factor.mul(A[k][j]));
      }
    }

    const U = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (j < i ? new Decimal(0) : A[i][j])));
    const P = Matrix.zeros(n, n);
    for (let i = 0; i < n; i++) P.data[i][Pvec[i]] = new Decimal(1);
    return { L: new Matrix(L), U: new Matrix(U), P: P };
  }

  determinant() {
    if (this.rows !== this.cols) throw new Error('Determinant only for square');
    const n = this.rows;
    const { L, U, P } = this.lu();
    let det = new Decimal(1);
    for (let i = 0; i < n; i++) det = det.mul(U.data[i][i]);
    // permutation sign
    const perm = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) if (P.data[i][j].equals(1)) perm.push(j);
    }
    let inv = 0;
    for (let i = 0; i < perm.length; i++) for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) inv++;
    if (inv % 2 === 1) det = det.negated();
    return det;
  }

  inverse() {
    if (this.rows !== this.cols) throw new Error('Inverse only for square');
    const n = this.rows;
    const aug = Array.from({ length: n }, (_, i) => Array.from({ length: 2 * n }, (_, j) => (j < n ? new Decimal(this.data[i][j]) : (j - n === i ? new Decimal(1) : new Decimal(0)))));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      let maxAbs = aug[col][col].abs();
      for (let r = col + 1; r < n; r++) {
        const aabs = aug[r][col].abs();
        if (aabs.greaterThan(maxAbs)) { maxAbs = aabs; pivot = r; }
      }
      if (aug[pivot][col].isZero()) throw new Error('Singular matrix');
      if (pivot !== col) {
        const tmp = aug[col]; aug[col] = aug[pivot]; aug[pivot] = tmp;
      }
      const pivval = aug[col][col];
      for (let j = 0; j < 2 * n; j++) aug[col][j] = aug[col][j].div(pivval);
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = aug[r][col];
        if (factor.isZero()) continue;
        for (let j = 0; j < 2 * n; j++) aug[r][j] = aug[r][j].minus(factor.mul(aug[col][j]));
      }
    }
    const inv = aug.map(row => row.slice(n));
    return new Matrix(inv);
  }

  // solve Ax = b where b is Vector or array; returns Vector
  solve(b) {
    let B;
    if (b instanceof Vector) B = b;
    else if (Array.isArray(b)) B = Vector.from(b);
    else throw new Error('b must be Vector or array');
    if (this.rows !== this.cols) throw new Error('Solve only implemented for square A');
    const n = this.rows;
    if (B.length !== n) throw new Error('dimension mismatch');
    // convert to augmented array
    const aug = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) => new Decimal(j < n ? this.data[i][j] : B.data[i])));
    // forward elimination
    for (let col = 0; col < n; col++) {
      let pivot = col;
      let maxAbs = aug[col][col].abs();
      for (let r = col + 1; r < n; r++) {
        const aabs = aug[r][col].abs();
        if (aabs.greaterThan(maxAbs)) { maxAbs = aabs; pivot = r; }
      }
      if (aug[pivot][col].isZero()) throw new Error('Singular or no unique solution');
      if (pivot !== col) { const tmp = aug[col]; aug[col] = aug[pivot]; aug[pivot] = tmp; }
      for (let r = col + 1; r < n; r++) {
        const factor = aug[r][col].div(aug[col][col]);
        if (factor.isZero()) continue;
        for (let j = col; j < n + 1; j++) aug[r][j] = aug[r][j].minus(factor.mul(aug[col][j]));
      }
    }
    // back substitution
    const x = Array.from({ length: n }, () => new Decimal(0));
    for (let i = n - 1; i >= 0; i--) {
      let sum = new Decimal(0);
      for (let j = i + 1; j < n; j++) sum = sum.plus(aug[i][j].mul(x[j]));
      x[i] = aug[i][n].minus(sum).div(aug[i][i]);
    }
    return new Vector(x);
  }

  // QR via Householder (returns {Q, R})
  qr() {
    const m = this.rows, n = this.cols;
    let A = this.clone().data.map(r => r.map(v => new Decimal(v)));
    const Q = Matrix.identity(m).data;
    for (let k = 0; k < Math.min(m, n); k++) {
      const x = [];
      for (let i = k; i < m; i++) x.push(A[i][k]);
      let normx = new Decimal(0);
      for (const xi of x) normx = normx.plus(xi.mul(xi));
      normx = normx.sqrt();
      if (normx.isZero()) continue;
      const sign = x[0].isNegative() ? new Decimal(-1) : new Decimal(1);
      const v = x.slice();
      v[0] = v[0].plus(sign.mul(normx));
      let vnorm = new Decimal(0);
      for (const vi of v) vnorm = vnorm.plus(vi.mul(vi));
      vnorm = vnorm.sqrt();
      if (vnorm.isZero()) continue;
      for (let i = 0; i < v.length; i++) v[i] = v[i].div(vnorm);
      for (let j = k; j < n; j++) {
        let dot = new Decimal(0);
        for (let i = 0; i < v.length; i++) dot = dot.plus(v[i].mul(A[k + i][j]));
        for (let i = 0; i < v.length; i++) A[k + i][j] = A[k + i][j].minus(new Decimal(2).mul(v[i]).mul(dot));
      }
      for (let j = 0; j < m; j++) {
        let dot = new Decimal(0);
        for (let i = 0; i < v.length; i++) dot = dot.plus(v[i].mul(Q[k + i][j]));
        for (let i = 0; i < v.length; i++) Q[k + i][j] = Q[k + i][j].minus(new Decimal(2).mul(v[i]).mul(dot));
      }
    }
    const R = Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => (i <= j ? A[i][j] : new Decimal(0))));
    return { Q: new Matrix(Q).transpose(), R: new Matrix(R) };
  }

  // simple matrix exponential via Taylor + scaling & squaring (practical default)
  exp(options = {}) {
    const n = this.rows;
    if (n !== this.cols) throw new Error('exp requires square matrix');
    const ident = Matrix.identity(n);
    const normInf = (M) => {
      let max = new Decimal(0);
      for (let i = 0; i < M.rows; i++) {
        let rowSum = new Decimal(0);
        for (let j = 0; j < M.cols; j++) rowSum = rowSum.plus(M.data[i][j].abs());
        if (rowSum.greaterThan(max)) max = rowSum;
      }
      return max;
    };
    const maxNorm = normInf(this);
    let s = 0;
    if (maxNorm.greaterThan(new Decimal(1))) {
      const ratio = maxNorm.div(new Decimal(1));
      s = Math.max(0, Math.ceil(Math.log2(ratio.toNumber())));
    }
    let A = this;
    if (s > 0) A = this.mul(new Decimal(1).div(new Decimal(2).pow(s)));
    const maxIter = options.maxIter || 120;
    const tol = new Decimal(options.tolerance || '1e-40');
    let term = ident.clone();
    let result = ident.clone();
    for (let k = 1; k < maxIter; k++) {
      term = term.mul(A).mul(new Decimal(1).div(k));
      result = result.add(term);
      // smallness check
      let tnorm = new Decimal(0);
      for (let i = 0; i < term.rows; i++) for (let j = 0; j < term.cols; j++) tnorm = tnorm.plus(term.data[i][j].abs());
      if (tnorm.lessThan(tol)) break;
    }
    for (let i = 0; i < s; i++) result = result.mul(result);
    return result;
  }
}