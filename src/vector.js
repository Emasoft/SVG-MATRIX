import Decimal from "decimal.js";

/**
 * Helper to convert any numeric input to Decimal.
 * Accepts numbers, strings, or Decimal instances.
 * @param {number|string|Decimal} x - The value to convert
 * @returns {Decimal} The Decimal representation
 * @throws {Error} If x is null, undefined, or cannot be converted to Decimal
 */
const D = (x) => {
  if (x === null || x === undefined) {
    throw new Error(
      `Cannot convert ${x === null ? "null" : "undefined"} to Decimal`,
    );
  }
  if (x instanceof Decimal) return x;
  try {
    return new Decimal(x);
  } catch (err) {
    throw new Error(`Invalid numeric value: ${err.message}`);
  }
};

/**
 * Vector - Decimal-backed vector class for arbitrary-precision vector operations.
 *
 * All numeric inputs are automatically converted to Decimal for high precision.
 * Supports basic operations (add, sub, scale), products (dot, cross, outer),
 * and geometric operations (norm, normalize, angle, projection).
 *
 * @class
 * @property {Array<Decimal>} data - Array of Decimal vector components
 * @property {number} length - Number of components in the vector
 *
 * @example
 * const v = Vector.from([1, 2, 3]);
 * const w = Vector.from(['1.5', '2.5', '3.5']);
 * console.log(v.dot(w).toString()); // dot product as Decimal
 */
export class Vector {
  /**
   * Create a new Vector from an array of components.
   * @param {Array<number|string|Decimal>} components - Array of vector components
   * @throws {Error} If components is not an array, is empty, or contains invalid values
   */
  constructor(components) {
    if (!Array.isArray(components)) throw new Error("Vector requires array");
    if (components.length === 0)
      throw new Error("Vector requires at least one component");
    try {
      this.data = components.map((c, i) => {
        if (c === null || c === undefined) {
          throw new Error(
            `Vector component at index ${i} is ${c === null ? "null" : "undefined"}`,
          );
        }
        return D(c);
      });
    } catch (err) {
      throw new Error(`Vector constructor failed: ${err.message}`);
    }
    this.length = this.data.length;
  }

  /**
   * Factory method to create a Vector from an array.
   * @param {Array<number|string|Decimal>} arr - Array of vector components
   * @returns {Vector} New Vector instance
   * @throws {Error} If arr is null or undefined
   */
  static from(arr) {
    if (arr === null || arr === undefined) {
      throw new Error(
        `Vector.from: argument is ${arr === null ? "null" : "undefined"}`,
      );
    }
    return new Vector(arr);
  }

  /**
   * Create a deep copy of this vector.
   * @returns {Vector} New Vector with copied values
   */
  clone() {
    return new Vector(this.data.map((v) => new Decimal(v)));
  }

  /**
   * Return the internal Decimal array (shallow copy).
   * Use toNumberArray() or toStringArray() for converted values.
   * @returns {Decimal[]} Array of Decimal values
   */
  toArray() {
    return this.data.slice();
  }

  /**
   * Convert vector to array of JavaScript numbers.
   * Note: May lose precision for very large or precise values.
   * @returns {number[]} Array of number values
   */
  toNumberArray() {
    return this.data.map((v) => v.toNumber());
  }

  /**
   * Convert vector to array of string representations.
   * Preserves full precision of Decimal values.
   * @returns {string[]} Array of string values
   */
  toStringArray() {
    return this.data.map((v) => v.toString());
  }

  /**
   * Element-wise addition with another vector.
   * @param {Vector} other - Vector to add
   * @returns {Vector} New Vector with sum
   * @throws {Error} If other is not a Vector or dimensions mismatch
   */
  add(other) {
    if (!other || !(other instanceof Vector)) {
      throw new Error("add: argument must be a Vector");
    }
    if (this.length !== other.length) {
      throw new Error(
        `add: dimension mismatch (${this.length} vs ${other.length})`,
      );
    }
    return new Vector(this.data.map((v, i) => v.plus(other.data[i])));
  }

  /**
   * Element-wise subtraction with another vector.
   * @param {Vector} other - Vector to subtract
   * @returns {Vector} New Vector with difference
   * @throws {Error} If other is not a Vector or dimensions mismatch
   */
  sub(other) {
    if (!other || !(other instanceof Vector)) {
      throw new Error("sub: argument must be a Vector");
    }
    if (this.length !== other.length) {
      throw new Error(
        `sub: dimension mismatch (${this.length} vs ${other.length})`,
      );
    }
    return new Vector(this.data.map((v, i) => v.minus(other.data[i])));
  }

  /**
   * Scalar multiplication.
   * @param {number|string|Decimal} scalar - Scalar to multiply by
   * @returns {Vector} New scaled Vector
   * @throws {Error} If scalar is null, undefined, or invalid
   */
  scale(scalar) {
    if (scalar === null || scalar === undefined) {
      throw new Error(
        `scale: scalar is ${scalar === null ? "null" : "undefined"}`,
      );
    }
    let s;
    try {
      s = D(scalar);
    } catch (err) {
      throw new Error(`scale: invalid scalar - ${err.message}`);
    }
    return new Vector(this.data.map((v) => v.mul(s)));
  }

  /**
   * Negate the vector (multiply by -1).
   * @returns {Vector} New Vector with negated components
   */
  negate() {
    return new Vector(this.data.map((v) => v.negated()));
  }

  /**
   * Dot product (inner product) with another vector.
   * @param {Vector} other - Vector to compute dot product with
   * @returns {Decimal} The dot product as a Decimal
   * @throws {Error} If other is not a Vector or dimensions mismatch
   */
  dot(other) {
    if (!other || !(other instanceof Vector)) {
      throw new Error("dot: argument must be a Vector");
    }
    if (this.length !== other.length) {
      throw new Error(
        `dot: dimension mismatch (${this.length} vs ${other.length})`,
      );
    }
    return this.data.reduce(
      (acc, v, i) => acc.plus(v.mul(other.data[i])),
      new Decimal(0),
    );
  }

  /**
   * Outer product (tensor product) with another vector.
   * Returns a 2D array of Decimals representing an m×n matrix,
   * where m is this vector's length and n is other's length.
   *
   * Note: Returns raw 2D array, not Matrix, to avoid circular dependency.
   * Use Matrix.from(v.outer(w)) to get a Matrix object.
   *
   * @param {Vector} other - Vector to compute outer product with
   * @returns {Decimal[][]} 2D array of Decimals (can be passed to Matrix.from())
   * @throws {Error} If other is not a Vector or either vector is empty
   */
  outer(other) {
    if (!other || !(other instanceof Vector)) {
      throw new Error("outer: argument must be a Vector");
    }
    if (this.length === 0 || other.length === 0) {
      throw new Error("outer: cannot compute outer product with empty vector");
    }
    const rows = this.length,
      cols = other.length;
    const out = Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (_, j) => this.data[i].mul(other.data[j])),
    );
    return out;
  }

  /**
   * Cross product for 3D vectors only.
   * @param {Vector} other - 3D Vector to compute cross product with
   * @returns {Vector} New 3D Vector perpendicular to both inputs
   * @throws {Error} If other is not a Vector or either vector is not 3D
   */
  cross(other) {
    if (!other || !(other instanceof Vector)) {
      throw new Error("cross: argument must be a Vector");
    }
    if (this.length !== 3 || other.length !== 3) {
      throw new Error(
        `cross: requires 3D vectors (got ${this.length}D and ${other.length}D)`,
      );
    }
    const [a1, a2, a3] = this.data;
    const [b1, b2, b3] = other.data;
    return new Vector([
      a2.mul(b3).minus(a3.mul(b2)),
      a3.mul(b1).minus(a1.mul(b3)),
      a1.mul(b2).minus(a2.mul(b1)),
    ]);
  }

  /**
   * Euclidean norm (L2 norm, magnitude) of the vector.
   * @returns {Decimal} The norm as a Decimal
   */
  norm() {
    let sum = new Decimal(0);
    for (const v of this.data) sum = sum.plus(v.mul(v));
    return sum.sqrt();
  }

  /**
   * Return a normalized (unit length) version of this vector.
   * @returns {Vector} New unit Vector in same direction
   * @throws {Error} If vector is zero (cannot normalize)
   */
  normalize() {
    const n = this.norm();
    if (n.isZero()) throw new Error("Cannot normalize zero vector");
    return this.scale(new Decimal(1).div(n));
  }

  /**
   * Angle between this vector and another (in radians).
   * @param {Vector} other - Vector to compute angle with
   * @returns {Decimal} Angle in radians as a Decimal
   * @throws {Error} If other is not a Vector, dimensions mismatch, or either vector is zero
   */
  angleBetween(other) {
    if (!other || !(other instanceof Vector)) {
      throw new Error("angleBetween: argument must be a Vector");
    }
    if (this.length !== other.length) {
      throw new Error(
        `angleBetween: dimension mismatch (${this.length} vs ${other.length})`,
      );
    }
    const dotProduct = this.dot(other);
    const n1 = this.norm();
    const n2 = other.norm();
    if (n1.isZero() || n2.isZero()) {
      throw new Error("angleBetween: angle with zero vector is undefined");
    }
    // Clamp cosine to [-1, 1] for numerical safety
    const cosv = dotProduct.div(n1.mul(n2));
    const cosNum = cosv.toNumber();
    const clamped = Math.min(1, Math.max(-1, cosNum));
    return new Decimal(Math.acos(clamped));
  }

  /**
   * Project this vector onto another vector.
   * @param {Vector} other - Vector to project onto
   * @returns {Vector} The projection of this onto other
   * @throws {Error} If other is not a Vector, dimensions mismatch, or other is zero vector
   */
  projectOnto(other) {
    if (!other || !(other instanceof Vector)) {
      throw new Error("projectOnto: argument must be a Vector");
    }
    if (this.length !== other.length) {
      throw new Error(
        `projectOnto: dimension mismatch (${this.length} vs ${other.length})`,
      );
    }
    const denom = other.dot(other);
    if (denom.isZero()) {
      throw new Error("projectOnto: cannot project onto zero vector");
    }
    const coef = this.dot(other).div(denom);
    return other.scale(coef);
  }

  /**
   * Compute a vector orthogonal to this one.
   * For 2D: returns the perpendicular [-y, x].
   * For nD: uses Gram-Schmidt with standard basis vectors.
   * @returns {Vector} A vector orthogonal to this (normalized for nD, unnormalized for 2D)
   * @throws {Error} If unable to find orthogonal vector (e.g., zero vector)
   */
  orthogonal() {
    const n = this.norm();
    if (n.isZero()) {
      throw new Error(
        "orthogonal: cannot find orthogonal vector to zero vector",
      );
    }
    if (this.length === 2) {
      // 2D perpendicular: rotate 90 degrees counterclockwise [-y, x]
      return new Vector([this.data[1].negated(), this.data[0]]);
    }
    // For n > 2: find a standard basis vector not parallel to this,
    // then use Gram-Schmidt orthogonalization
    for (let i = 0; i < this.length; i++) {
      const ei = Array.from(
        { length: this.length },
        (_, j) => new Decimal(j === i ? 1 : 0),
      );
      const candidate = new Vector(ei);
      // Project candidate out of this vector's direction
      const proj = candidate.projectOnto(this);
      const orth = candidate.sub(proj);
      const orthNorm = orth.norm();
      if (!orthNorm.isZero()) return orth.normalize();
    }
    throw new Error(
      "orthogonal: unable to find orthogonal vector (degenerate case)",
    );
  }

  /**
   * Check if this vector is orthogonal to another.
   * @param {Vector} other - Vector to check orthogonality with
   * @returns {boolean} True if vectors are orthogonal (dot product is zero)
   * @throws {Error} If other is not a Vector or dimensions mismatch
   */
  isOrthogonalTo(other) {
    if (!other || !(other instanceof Vector)) {
      throw new Error("isOrthogonalTo: argument must be a Vector");
    }
    if (this.length !== other.length) {
      throw new Error(
        `isOrthogonalTo: dimension mismatch (${this.length} vs ${other.length})`,
      );
    }
    return this.dot(other).isZero();
  }

  /**
   * Euclidean distance to another vector.
   * @param {Vector} other - Vector to compute distance to
   * @returns {Decimal} The Euclidean distance
   * @throws {Error} If other is not a Vector or dimensions mismatch
   */
  distance(other) {
    if (!other || !(other instanceof Vector)) {
      throw new Error("distance: argument must be a Vector");
    }
    if (this.length !== other.length) {
      throw new Error(
        `distance: dimension mismatch (${this.length} vs ${other.length})`,
      );
    }
    return this.sub(other).norm();
  }

  /**
   * Check equality with another vector within optional tolerance.
   * @param {Vector} other - Vector to compare with
   * @param {number|string|Decimal} [tolerance=0] - Maximum allowed difference per component
   * @returns {boolean} True if vectors are equal within tolerance
   * @throws {Error} If tolerance is invalid (null, NaN, or negative)
   */
  equals(other, tolerance = 0) {
    if (!(other instanceof Vector)) return false;
    if (other.length !== this.length) return false;
    if (tolerance === null) {
      throw new Error("equals: tolerance cannot be null");
    }
    let tol;
    try {
      tol = D(tolerance);
      if (tol.isNaN()) {
        throw new Error("equals: tolerance cannot be NaN");
      }
      if (tol.isNegative()) {
        throw new Error("equals: tolerance must be non-negative");
      }
    } catch (err) {
      throw new Error(`equals: invalid tolerance - ${err.message}`);
    }
    for (let i = 0; i < this.length; i++) {
      const diff = this.data[i].minus(other.data[i]).abs();
      if (diff.greaterThan(tol)) return false;
    }
    return true;
  }
}
