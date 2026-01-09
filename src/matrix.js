import Decimal from "decimal.js";
import { Vector } from "./vector.js";

/**
 * Helper to convert any numeric input to Decimal.
 * Accepts numbers, strings, or Decimal instances.
 * @param {number|string|Decimal} x - The value to convert
 * @returns {Decimal} The Decimal representation
 * @throws {Error} If x is null or undefined
 */
const D = (x) => {
  // Validate that x is not null or undefined
  if (x == null) throw new Error("Cannot convert null or undefined to Decimal");
  return x instanceof Decimal ? x : new Decimal(x);
};

/**
 * Matrix - Decimal-backed matrix class for arbitrary-precision matrix operations.
 *
 * All numeric inputs are automatically converted to Decimal for high precision.
 * Supports basic operations (add, sub, mul, transpose), linear algebra
 * (LU, QR, determinant, inverse, solve), and matrix exponential.
 *
 * @class
 * @property {Array<Array<Decimal>>} data - 2D array of Decimal matrix elements
 * @property {number} rows - Number of rows in the matrix
 * @property {number} cols - Number of columns in the matrix
 *
 * @example
 * const M = Matrix.from([[1, 2], [3, 4]]);
 * const I = Matrix.identity(2);
 * const product = M.mul(I);
 * console.log(product.toArrayOfStrings());
 */
export class Matrix {
  /**
   * Create a new Matrix from a 2D array.
   * @param {Array<Array<number|string|Decimal>>} data - 2D array of matrix elements
   * @throws {Error} If data is not a non-empty 2D array with consistent row lengths
   */
  constructor(data) {
    // Validate data is a non-empty array
    if (!Array.isArray(data) || data.length === 0)
      throw new Error("Matrix requires non-empty 2D array");
    // Validate first row exists and is non-empty
    if (!Array.isArray(data[0]) || data[0].length === 0)
      throw new Error("Matrix rows must be non-empty arrays");
    const cols = data[0].length;
    // Validate all rows have the same length
    for (const row of data) {
      if (!Array.isArray(row) || row.length !== cols)
        throw new Error("All rows must have same length");
    }
    this.data = data.map((r) => r.map((v) => D(v)));
    this.rows = data.length;
    this.cols = cols;
  }

  /**
   * Factory method to create a Matrix from a 2D array.
   * @param {Array<Array<number|string|Decimal>>} arr - 2D array of matrix elements
   * @returns {Matrix} New Matrix instance
   */
  static from(arr) {
    return new Matrix(arr);
  }

  /**
   * Create a matrix of zeros.
   * @param {number} r - Number of rows
   * @param {number} c - Number of columns
   * @returns {Matrix} New r×c zero matrix
   * @throws {Error} If r or c are not positive integers
   */
  static zeros(r, c) {
    // Validate r and c are positive integers
    if (!Number.isInteger(r) || r <= 0)
      throw new Error("rows must be a positive integer");
    if (!Number.isInteger(c) || c <= 0)
      throw new Error("cols must be a positive integer");
    const out = Array.from({ length: r }, () =>
      Array.from({ length: c }, () => new Decimal(0)),
    );
    return new Matrix(out);
  }

  /**
   * Create an identity matrix.
   * @param {number} n - Size of the square identity matrix
   * @returns {Matrix} New n×n identity matrix
   * @throws {Error} If n is not a positive integer
   */
  static identity(n) {
    // Validate n is a positive integer
    if (!Number.isInteger(n) || n <= 0)
      throw new Error("size must be a positive integer");
    const out = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        (i === j ? new Decimal(1) : new Decimal(0)),
      ),
    );
    return new Matrix(out);
  }

  /**
   * Create a deep copy of this matrix.
   * @returns {Matrix} New Matrix with copied values
   */
  clone() {
    return new Matrix(this.data.map((r) => r.map((v) => new Decimal(v))));
  }

  /**
   * Convert matrix to 2D array of strings.
   * Preserves full precision of Decimal values.
   * @returns {string[][]} 2D array of string values
   */
  toArrayOfStrings() {
    return this.data.map((r) => r.map((v) => v.toString()));
  }

  /**
   * Convert matrix to 2D array of JavaScript numbers.
   * Note: May lose precision for very large or precise values.
   * @returns {number[][]} 2D array of number values
   */
  toNumberArray() {
    return this.data.map((r) => r.map((v) => v.toNumber()));
  }

  /**
   * Check if this is a square matrix.
   * @returns {boolean} True if rows equals cols
   */
  isSquare() {
    return this.rows === this.cols;
  }

  /**
   * Apply this matrix to a Vector (matrix-vector multiplication).
   * @param {Vector|Array} vec - Vector or array to multiply
   * @returns {Vector} Result of M × v
   * @throws {Error} If dimensions don't match
   */
  applyToVector(vec) {
    let v;
    if (vec instanceof Vector) v = vec;
    else if (Array.isArray(vec)) v = Vector.from(vec);
    else throw new Error("applyToVector expects Vector or array");
    if (this.cols !== v.length)
      throw new Error("shape mismatch: matrix cols must equal vector length");
    const out = [];
    for (let i = 0; i < this.rows; i++) {
      let sum = new Decimal(0);
      for (let j = 0; j < this.cols; j++)
        sum = sum.plus(this.data[i][j].mul(v.data[j]));
      out.push(sum);
    }
    return new Vector(out);
  }

  /**
   * Element-wise addition, or scalar addition if other is a number.
   * @param {Matrix|number|string|Decimal} other - Matrix or scalar to add
   * @returns {Matrix} New Matrix with sum
   * @throws {Error} If dimensions mismatch (for Matrix addition)
   */
  add(other) {
    if (other instanceof Matrix) {
      if (this.rows !== other.rows || this.cols !== other.cols)
        throw new Error("shape mismatch: matrices must have same dimensions");
      return new Matrix(
        this.data.map((r, i) => r.map((v, j) => v.plus(other.data[i][j]))),
      );
    } else {
      const s = D(other);
      return new Matrix(this.data.map((r) => r.map((v) => v.plus(s))));
    }
  }

  /**
   * Element-wise subtraction, or scalar subtraction if other is a number.
   * @param {Matrix|number|string|Decimal} other - Matrix or scalar to subtract
   * @returns {Matrix} New Matrix with difference
   * @throws {Error} If dimensions mismatch (for Matrix subtraction)
   */
  sub(other) {
    if (other instanceof Matrix) {
      if (this.rows !== other.rows || this.cols !== other.cols)
        throw new Error("shape mismatch: matrices must have same dimensions");
      return new Matrix(
        this.data.map((r, i) => r.map((v, j) => v.minus(other.data[i][j]))),
      );
    } else {
      const s = D(other);
      return new Matrix(this.data.map((r) => r.map((v) => v.minus(s))));
    }
  }

  /**
   * Matrix multiplication, or scalar multiplication if other is a number.
   * @param {Matrix|number|string|Decimal} other - Matrix or scalar to multiply
   * @returns {Matrix} New Matrix with product
   * @throws {Error} If dimensions don't allow multiplication
   */
  mul(other) {
    if (other instanceof Matrix) {
      if (this.cols !== other.rows)
        throw new Error(
          "shape mismatch: A.cols must equal B.rows for matrix multiplication",
        );
      const out = Array.from({ length: this.rows }, () =>
        Array.from({ length: other.cols }, () => new Decimal(0)),
      );
      for (let i = 0; i < this.rows; i++) {
        for (let k = 0; k < this.cols; k++) {
          const aik = this.data[i][k];
          if (aik.isZero()) continue;
          for (let j = 0; j < other.cols; j++)
            out[i][j] = out[i][j].plus(aik.mul(other.data[k][j]));
        }
      }
      return new Matrix(out);
    } else {
      const s = D(other);
      return new Matrix(this.data.map((r) => r.map((v) => v.mul(s))));
    }
  }

  /**
   * Scalar division (divide all elements by scalar).
   * @param {number|string|Decimal} scalar - Scalar to divide by
   * @returns {Matrix} New Matrix with each element divided
   * @throws {Error} If scalar is zero
   */
  div(scalar) {
    const s = D(scalar);
    if (s.isZero()) throw new Error("Cannot divide by zero");
    return new Matrix(this.data.map((r) => r.map((v) => v.div(s))));
  }

  /**
   * Negate all elements (multiply by -1).
   * @returns {Matrix} New Matrix with negated elements
   */
  negate() {
    return new Matrix(this.data.map((r) => r.map((v) => v.negated())));
  }

  /**
   * Transpose the matrix (swap rows and columns).
   * @returns {Matrix} New transposed Matrix
   */
  transpose() {
    const out = Array.from({ length: this.cols }, (_, i) =>
      Array.from({ length: this.rows }, (_, j) => new Decimal(this.data[j][i])),
    );
    return new Matrix(out);
  }

  /**
   * Compute the trace (sum of diagonal elements).
   * Only defined for square matrices.
   * @returns {Decimal} Sum of diagonal elements
   * @throws {Error} If matrix is not square
   */
  trace() {
    if (!this.isSquare())
      throw new Error("Trace only defined for square matrices");
    let sum = new Decimal(0);
    for (let i = 0; i < this.rows; i++) {
      sum = sum.plus(this.data[i][i]);
    }
    return sum;
  }

  /**
   * Check equality with another matrix within optional tolerance.
   * @param {Matrix} other - Matrix to compare with
   * @param {number|string|Decimal} [tolerance=0] - Maximum allowed difference per element
   * @returns {boolean} True if matrices are equal within tolerance
   * @throws {Error} If tolerance is negative or not finite
   */
  equals(other, tolerance = 0) {
    if (!(other instanceof Matrix)) return false;
    if (this.rows !== other.rows || this.cols !== other.cols) return false;
    const tol = D(tolerance);
    // Validate tolerance is non-negative and finite to prevent Infinity tolerance
    if (tol.isNegative() || !tol.isFinite())
      throw new Error("tolerance must be non-negative and finite");
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const diff = this.data[i][j].minus(other.data[i][j]).abs();
        if (diff.greaterThan(tol)) return false;
      }
    }
    return true;
  }

  /**
   * LU decomposition with partial pivoting.
   * Returns L (lower triangular), U (upper triangular), and P (permutation matrix)
   * such that P × A = L × U.
   * @returns {{L: Matrix, U: Matrix, P: Matrix}} LU decomposition components
   * @throws {Error} If matrix is not square or is singular
   */
  lu() {
    if (!this.isSquare())
      throw new Error("LU decomposition requires square matrix");
    const n = this.rows;
    const A = this.data.map((r) => r.map((v) => new Decimal(v)));
    const Pvec = Array.from({ length: n }, (_, i) => i);
    const L = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => new Decimal(0)),
    );
    for (let i = 0; i < n; i++) L[i][i] = new Decimal(1);

    for (let k = 0; k < n; k++) {
      // Find pivot
      let pivot = k;
      let maxAbs = A[k][k].abs();
      for (let i = k + 1; i < n; i++) {
        const aabs = A[i][k].abs();
        if (aabs.greaterThan(maxAbs)) {
          maxAbs = aabs;
          pivot = i;
        }
      }
      if (A[pivot][k].isZero())
        throw new Error("Singular matrix: LU decomposition failed");
      // Swap rows
      if (pivot !== k) {
        const tmp = A[k];
        A[k] = A[pivot];
        A[pivot] = tmp;
        const tmpIdx = Pvec[k];
        Pvec[k] = Pvec[pivot];
        Pvec[pivot] = tmpIdx;
        for (let j = 0; j < k; j++) {
          const t = L[k][j];
          L[k][j] = L[pivot][j];
          L[pivot][j] = t;
        }
      }
      // Elimination
      for (let i = k + 1; i < n; i++) {
        const factor = A[i][k].div(A[k][k]);
        L[i][k] = factor;
        for (let j = k; j < n; j++)
          A[i][j] = A[i][j].minus(factor.mul(A[k][j]));
      }
    }

    const U = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (j < i ? new Decimal(0) : A[i][j])),
    );
    const P = Matrix.zeros(n, n);
    for (let i = 0; i < n; i++) P.data[i][Pvec[i]] = new Decimal(1);
    return { L: new Matrix(L), U: new Matrix(U), P: P };
  }

  /**
   * Compute the determinant of a square matrix.
   * Uses LU decomposition.
   * @returns {Decimal} The determinant
   * @throws {Error} If matrix is not square
   */
  determinant() {
    if (!this.isSquare())
      throw new Error("Determinant only defined for square matrices");
    const n = this.rows;
    const { L: _L, U, P } = this.lu();
    let det = new Decimal(1);
    for (let i = 0; i < n; i++) det = det.mul(U.data[i][i]);
    // Compute permutation sign
    const perm = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) if (P.data[i][j].equals(1)) perm.push(j);
    }
    let inversions = 0;
    for (let i = 0; i < perm.length; i++) {
      for (let j = i + 1; j < perm.length; j++) {
        if (perm[i] > perm[j]) inversions++;
      }
    }
    if (inversions % 2 === 1) det = det.negated();
    return det;
  }

  /**
   * Compute the inverse of a square matrix.
   * Uses Gauss-Jordan elimination with partial pivoting.
   * @returns {Matrix} The inverse matrix
   * @throws {Error} If matrix is not square or is singular
   */
  inverse() {
    if (!this.isSquare())
      throw new Error("Inverse only defined for square matrices");
    const n = this.rows;
    // Create augmented matrix [A | I]
    const aug = Array.from({ length: n }, (_, i) =>
      Array.from({ length: 2 * n }, (_, j) =>
        (j < n
          ? new Decimal(this.data[i][j])
          : j - n === i
            ? new Decimal(1)
            : new Decimal(0)),
      ),
    );
    // Gauss-Jordan elimination
    for (let col = 0; col < n; col++) {
      // Find pivot
      let pivot = col;
      let maxAbs = aug[col][col].abs();
      for (let r = col + 1; r < n; r++) {
        const aabs = aug[r][col].abs();
        if (aabs.greaterThan(maxAbs)) {
          maxAbs = aabs;
          pivot = r;
        }
      }
      if (aug[pivot][col].isZero())
        throw new Error("Singular matrix: inverse does not exist");
      // Swap rows
      if (pivot !== col) {
        const tmp = aug[col];
        aug[col] = aug[pivot];
        aug[pivot] = tmp;
      }
      // Scale pivot row
      const pivval = aug[col][col];
      for (let j = 0; j < 2 * n; j++) aug[col][j] = aug[col][j].div(pivval);
      // Eliminate column
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = aug[r][col];
        if (factor.isZero()) continue;
        for (let j = 0; j < 2 * n; j++)
          aug[r][j] = aug[r][j].minus(factor.mul(aug[col][j]));
      }
    }
    // Extract inverse from augmented matrix
    const inv = aug.map((row) => row.slice(n));
    return new Matrix(inv);
  }

  /**
   * Solve the linear system Ax = b where A is this matrix.
   * Uses Gaussian elimination with partial pivoting.
   * @param {Vector|Array} b - Right-hand side vector
   * @returns {Vector} Solution vector x
   * @throws {Error} If matrix is not square, dimensions mismatch, or system is singular
   */
  solve(b) {
    let B;
    if (b instanceof Vector) B = b;
    else if (Array.isArray(b)) B = Vector.from(b);
    else throw new Error("b must be Vector or array");
    if (!this.isSquare())
      throw new Error("solve() only implemented for square matrices");
    const n = this.rows;
    if (B.length !== n)
      throw new Error("dimension mismatch: b length must equal matrix rows");
    // Create augmented matrix [A | b]
    const aug = Array.from({ length: n }, (_, i) =>
      Array.from(
        { length: n + 1 },
        (_, j) => new Decimal(j < n ? this.data[i][j] : B.data[i]),
      ),
    );
    // Forward elimination
    for (let col = 0; col < n; col++) {
      let pivot = col;
      let maxAbs = aug[col][col].abs();
      for (let r = col + 1; r < n; r++) {
        const aabs = aug[r][col].abs();
        if (aabs.greaterThan(maxAbs)) {
          maxAbs = aabs;
          pivot = r;
        }
      }
      if (aug[pivot][col].isZero())
        throw new Error("Singular matrix: no unique solution");
      if (pivot !== col) {
        const tmp = aug[col];
        aug[col] = aug[pivot];
        aug[pivot] = tmp;
      }
      for (let r = col + 1; r < n; r++) {
        const factor = aug[r][col].div(aug[col][col]);
        if (factor.isZero()) continue;
        for (let j = col; j < n + 1; j++)
          aug[r][j] = aug[r][j].minus(factor.mul(aug[col][j]));
      }
    }
    // Back substitution
    const x = Array.from({ length: n }, () => new Decimal(0));
    for (let i = n - 1; i >= 0; i--) {
      // Check for zero diagonal element (should not happen after forward elimination)
      if (aug[i][i].isZero())
        throw new Error(
          "Zero diagonal element in back substitution: system is singular",
        );
      let sum = new Decimal(0);
      for (let j = i + 1; j < n; j++) sum = sum.plus(aug[i][j].mul(x[j]));
      x[i] = aug[i][n].minus(sum).div(aug[i][i]);
    }
    return new Vector(x);
  }

  /**
   * QR decomposition via Householder reflections.
   * Returns Q (orthogonal) and R (upper triangular) such that A = Q × R.
   * @returns {{Q: Matrix, R: Matrix}} QR decomposition components
   */
  qr() {
    const m = this.rows,
      n = this.cols;
    const A = this.data.map((r) => r.map((v) => new Decimal(v)));
    const Q = Matrix.identity(m).data;

    for (let k = 0; k < Math.min(m, n); k++) {
      // Extract column k below diagonal
      const x = [];
      for (let i = k; i < m; i++) x.push(A[i][k]);

      // Compute norm
      let normx = new Decimal(0);
      for (const xi of x) normx = normx.plus(xi.mul(xi));
      normx = normx.sqrt();
      if (normx.isZero()) continue;

      // Compute Householder vector
      const sign = x[0].isNegative() ? new Decimal(-1) : new Decimal(1);
      const v = x.slice();
      v[0] = v[0].plus(sign.mul(normx));

      // Normalize v
      let vnorm = new Decimal(0);
      for (const vi of v) vnorm = vnorm.plus(vi.mul(vi));
      vnorm = vnorm.sqrt();
      if (vnorm.isZero()) continue;
      for (let i = 0; i < v.length; i++) v[i] = v[i].div(vnorm);

      // Apply Householder reflection to A
      for (let j = k; j < n; j++) {
        let dot = new Decimal(0);
        for (let i = 0; i < v.length; i++)
          dot = dot.plus(v[i].mul(A[k + i][j]));
        for (let i = 0; i < v.length; i++)
          A[k + i][j] = A[k + i][j].minus(new Decimal(2).mul(v[i]).mul(dot));
      }

      // Apply Householder reflection to Q
      for (let j = 0; j < m; j++) {
        let dot = new Decimal(0);
        for (let i = 0; i < v.length; i++)
          dot = dot.plus(v[i].mul(Q[k + i][j]));
        for (let i = 0; i < v.length; i++)
          Q[k + i][j] = Q[k + i][j].minus(new Decimal(2).mul(v[i]).mul(dot));
      }
    }

    // Extract R (upper triangular part of A)
    const R = Array.from({ length: m }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i <= j ? A[i][j] : new Decimal(0))),
    );
    return { Q: new Matrix(Q).transpose(), R: new Matrix(R) };
  }

  /**
   * Compute matrix exponential using Taylor series with scaling and squaring.
   * exp(A) = I + A + A²/2! + A³/3! + ...
   * @param {Object} [options={}] - Options object
   * @param {number} [options.maxIter=120] - Maximum Taylor series iterations
   * @param {string} [options.tolerance='1e-40'] - Convergence tolerance
   * @returns {Matrix} The matrix exponential exp(A)
   * @throws {Error} If matrix is not square or options are invalid
   */
  exp(options = {}) {
    const n = this.rows;
    if (!this.isSquare())
      throw new Error("Matrix exponential requires square matrix");
    const ident = Matrix.identity(n);

    // Validate and set maxIter
    const maxIter = options.maxIter || 120;
    if (!Number.isInteger(maxIter) || maxIter <= 0)
      throw new Error("maxIter must be a positive integer");

    // Validate and set tolerance
    const tol = new Decimal(options.tolerance || "1e-40");
    if (tol.isNegative() || tol.isZero() || !tol.isFinite())
      throw new Error("tolerance must be positive and finite");

    // Compute infinity norm
    const normInf = (M) => {
      let max = new Decimal(0);
      for (let i = 0; i < M.rows; i++) {
        let rowSum = new Decimal(0);
        for (let j = 0; j < M.cols; j++)
          rowSum = rowSum.plus(M.data[i][j].abs());
        if (rowSum.greaterThan(max)) max = rowSum;
      }
      return max;
    };

    // Scaling: reduce norm below 1 for better convergence
    const maxNorm = normInf(this);
    let s = 0;
    if (maxNorm.greaterThan(new Decimal(1))) {
      const logVal = maxNorm.toNumber();
      // Guard against Infinity or NaN from logarithm
      if (!isFinite(logVal))
        throw new Error("Matrix norm too large for exponential computation");
      s = Math.max(0, Math.ceil(Math.log2(logVal)));
      // Cap scaling factor to prevent DoS - 50 iterations provides 2^50 scaling which is sufficient
      if (s > 50)
        throw new Error(
          `Matrix norm too large: requires ${s} scaling steps (max 50 allowed)`,
        );
    }
    let A = this;
    if (s > 0) A = this.mul(new Decimal(1).div(new Decimal(2).pow(s)));

    // Taylor series
    let term = ident.clone();
    let result = ident.clone();
    for (let k = 1; k < maxIter; k++) {
      term = term.mul(A).mul(new Decimal(1).div(k));
      result = result.add(term);
      // Check convergence
      let tnorm = new Decimal(0);
      for (let i = 0; i < term.rows; i++) {
        for (let j = 0; j < term.cols; j++) {
          tnorm = tnorm.plus(term.data[i][j].abs());
        }
      }
      if (tnorm.lessThan(tol)) break;
    }

    // Squaring: undo the scaling
    for (let i = 0; i < s; i++) result = result.mul(result);
    return result;
  }
}
