import Decimal from 'decimal.js';
import { Matrix, Vector, Transforms2D, Transforms3D } from '../src/index.js';

Decimal.set({ precision: 80 });

// Test utilities
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertClose(a, b, tol, message) {
  const aNum = a instanceof Decimal ? a.toNumber() : a;
  const bNum = b instanceof Decimal ? b.toNumber() : b;
  const diff = Math.abs(aNum - bNum);
  if (diff < tol) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message} (got ${aNum}, expected ${bNum}, diff=${diff})`);
  }
}

console.log('\n=== Vector Tests ===\n');

// Vector creation and conversion
const v = Vector.from(['1.234567890123456789', '2.34567890123456789', '3.4567890123456789']);
const w = Vector.from(['3.333333333333333333', '4.444444444444444444', '5.555555555555555555']);
assert(v.length === 3, 'Vector length is correct');
assert(v.toStringArray().length === 3, 'toStringArray returns 3 elements');
assert(v.toNumberArray().length === 3, 'toNumberArray returns 3 elements');
assert(v.toArray().length === 3, 'toArray returns 3 Decimals');
assert(v.toArray()[0] instanceof Decimal, 'toArray elements are Decimals');

// Vector arithmetic
const vAddW = v.add(w);
assert(vAddW.length === 3, 'add: result has correct length');
assertClose(vAddW.data[0], 4.567901223456790122, 1e-12, 'add: first element correct');

const vSubW = v.sub(w);
assert(vSubW.length === 3, 'sub: result has correct length');
assertClose(vSubW.data[0], -2.098765443209876544, 1e-12, 'sub: first element correct');

const vScaled = v.scale(2);
assertClose(vScaled.data[0], 2.469135780246913578, 1e-12, 'scale: correctly multiplied');

const vNeg = v.negate();
assertClose(vNeg.data[0], -1.234567890123456789, 1e-12, 'negate: correctly negated');
assert(v.add(vNeg).norm().toNumber() < 1e-30, 'negate: v + (-v) = 0');

// Dot and cross products
const dotProduct = v.dot(w);
assert(dotProduct instanceof Decimal, 'dot: returns Decimal');
assertClose(dotProduct, 33.74484926, 1e-6, 'dot: value correct');

const crossProduct = v.cross(w);
assert(crossProduct.length === 3, 'cross: returns 3D vector');
// Cross product should be perpendicular to both inputs
assertClose(crossProduct.dot(v).toNumber(), 0, 1e-10, 'cross: perpendicular to v');
assertClose(crossProduct.dot(w).toNumber(), 0, 1e-10, 'cross: perpendicular to w');

// Outer product
const outer = v.outer(w);
assert(Array.isArray(outer), 'outer: returns 2D array');
assert(outer.length === 3 && outer[0].length === 3, 'outer: dimensions are 3x3');
assertClose(outer[0][0].toNumber(), v.data[0].mul(w.data[0]).toNumber(), 1e-15, 'outer: element [0][0] correct');

// Norm and normalize
const vNorm = v.norm();
assertClose(vNorm, 4.356117268726211, 1e-10, 'norm: correct value');

const vNormalized = v.normalize();
assertClose(vNormalized.norm().toNumber(), 1, 1e-15, 'normalize: unit length');

// Angle between vectors
const angle = v.angleBetween(w);
assert(angle instanceof Decimal, 'angleBetween: returns Decimal');
assertClose(angle, 0.1676840474, 1e-6, 'angleBetween: angle between similar vectors');

// Projection
const proj = v.projectOnto(w);
assert(proj.length === 3, 'projectOnto: returns 3D vector');
// Projection should be parallel to w
const projCrossW = proj.cross(w);
assertClose(projCrossW.norm().toNumber(), 0, 1e-10, 'projectOnto: result parallel to target');

// Orthogonal
const orth = v.orthogonal();
assertClose(v.dot(orth).toNumber(), 0, 1e-10, 'orthogonal: perpendicular to original');

// Distance
const dist = v.distance(w);
assertClose(dist.toNumber(), v.sub(w).norm().toNumber(), 1e-15, 'distance: equals norm of difference');

// Equals
assert(v.equals(v), 'equals: vector equals itself');
assert(!v.equals(w), 'equals: different vectors not equal');
const vApprox = Vector.from([1.234567890123456789 + 1e-16, 2.34567890123456789, 3.4567890123456789]);
assert(v.equals(vApprox, 1e-14), 'equals: tolerance works');

// 2D orthogonal
const v2 = Vector.from([3, 4]);
const orth2 = v2.orthogonal();
assertClose(v2.dot(orth2).toNumber(), 0, 1e-15, 'orthogonal 2D: perpendicular');
assertClose(orth2.data[0].toNumber(), -4, 1e-15, 'orthogonal 2D: [-y, x] pattern');
assertClose(orth2.data[1].toNumber(), 3, 1e-15, 'orthogonal 2D: [-y, x] pattern');

console.log('\n=== Matrix Tests ===\n');

// Matrix creation
const M = Matrix.from([[1.5, 0, 0], [0, 2.5, 0], [0, 0, 3.5]]);
assert(M.rows === 3 && M.cols === 3, 'Matrix dimensions correct');
assert(M.isSquare(), 'isSquare: diagonal matrix is square');

const rect = Matrix.from([[1, 2], [3, 4], [5, 6]]);
assert(!rect.isSquare(), 'isSquare: 3x2 matrix not square');

// Matrix conversion
const numArr = M.toNumberArray();
assert(numArr[0][0] === 1.5, 'toNumberArray: correct values');
const strArr = M.toArrayOfStrings();
assert(strArr[0][0] === '1.5', 'toArrayOfStrings: correct values');

// Matrix zeros and identity
const Z = Matrix.zeros(2, 3);
assert(Z.rows === 2 && Z.cols === 3, 'zeros: correct dimensions');
assert(Z.data[0][0].isZero(), 'zeros: all zeros');

const I = Matrix.identity(3);
assert(I.data[0][0].equals(1) && I.data[1][1].equals(1), 'identity: ones on diagonal');
assert(I.data[0][1].isZero(), 'identity: zeros off diagonal');

// Matrix arithmetic
const M2 = Matrix.from([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
const M3 = Matrix.from([[9, 8, 7], [6, 5, 4], [3, 2, 1]]);
const Madd = M2.add(M3);
assert(Madd.data[0][0].equals(10), 'add: element correct');

const Msub = M2.sub(M3);
assert(Msub.data[0][0].equals(-8), 'sub: element correct');

const Mscaled = M2.mul(2);
assert(Mscaled.data[0][0].equals(2), 'mul scalar: element correct');

const Mdiv = M2.div(2);
assertClose(Mdiv.data[0][0].toNumber(), 0.5, 1e-15, 'div: element correct');

const Mneg = M2.negate();
assert(Mneg.data[0][0].equals(-1), 'negate: element correct');

// Trace
const tr = M.trace();
assertClose(tr.toNumber(), 7.5, 1e-15, 'trace: sum of diagonal');

// Transpose
const Mt = M2.transpose();
assert(Mt.rows === 3 && Mt.cols === 3, 'transpose: same dimensions for square');
assert(Mt.data[0][1].equals(4), 'transpose: element [0][1] was [1][0]');

// Matrix multiplication
const A = Matrix.from([[1, 2], [3, 4]]);
const B = Matrix.from([[5, 6], [7, 8]]);
const AB = A.mul(B);
assert(AB.data[0][0].equals(19), 'mul: [0][0] = 1*5 + 2*7 = 19');
assert(AB.data[0][1].equals(22), 'mul: [0][1] = 1*6 + 2*8 = 22');
assert(AB.data[1][0].equals(43), 'mul: [1][0] = 3*5 + 4*7 = 43');
assert(AB.data[1][1].equals(50), 'mul: [1][1] = 3*6 + 4*8 = 50');

// Matrix-vector multiplication
const mv = M.applyToVector(v);
assert(mv.length === 3, 'applyToVector: returns vector');
assertClose(mv.data[0].toNumber(), 1.5 * 1.234567890123456789, 1e-10, 'applyToVector: correct');

// Clone
const Mclone = M.clone();
assert(M.equals(Mclone), 'clone: equals original');

// Equals
assert(M.equals(M), 'equals: matrix equals itself');
assert(!M.equals(M2), 'equals: different matrices not equal');

// LU decomposition
const { L, U, P } = A.lu();
const LU = L.mul(U);
const PA = P.mul(A);
assert(LU.equals(PA, 1e-20), 'LU: P*A = L*U');

// Determinant
const detA = A.determinant();
assertClose(detA.toNumber(), -2, 1e-15, 'determinant: 2x2 det = ad-bc');

// Inverse
const Ainv = A.inverse();
const AinvA = Ainv.mul(A);
assert(AinvA.equals(Matrix.identity(2), 1e-15), 'inverse: A^-1 * A = I');

// Solve
const b = [1, 1];
const x = A.solve(b);
const Ax = A.applyToVector(x);
assertClose(Ax.data[0].toNumber(), 1, 1e-15, 'solve: A*x = b (first element)');
assertClose(Ax.data[1].toNumber(), 1, 1e-15, 'solve: A*x = b (second element)');

// QR decomposition
const { Q, R } = A.qr();
const QR = Q.mul(R);
assert(QR.equals(A, 1e-14), 'QR: Q*R = A');
const QtQ = Q.transpose().mul(Q);
assert(QtQ.equals(Matrix.identity(2), 1e-14), 'QR: Q is orthogonal');

// Matrix exponential
const rotGen = Matrix.from([[0, -1], [1, 0]]);
const expRotGen = rotGen.exp();
// exp of skew-symmetric rotation generator should be rotation matrix
assertClose(expRotGen.data[0][0].toNumber(), Math.cos(1), 1e-10, 'exp: rotation cos');
assertClose(expRotGen.data[0][1].toNumber(), -Math.sin(1), 1e-10, 'exp: rotation -sin');

console.log('\n=== Transforms2D Tests ===\n');

// Translation
const T2d = Transforms2D.translation(2, 3);
const pt = Transforms2D.applyTransform(T2d, 1, 1);
assertClose(pt[0].toNumber(), 3, 1e-15, 'translation: x shifted');
assertClose(pt[1].toNumber(), 4, 1e-15, 'translation: y shifted');

// Scale
const S2d = Transforms2D.scale(2, 3);
const ps = Transforms2D.applyTransform(S2d, 1, 1);
assertClose(ps[0].toNumber(), 2, 1e-15, 'scale: x scaled');
assertClose(ps[1].toNumber(), 3, 1e-15, 'scale: y scaled');

// Uniform scale
const Su = Transforms2D.scale(2);
const psu = Transforms2D.applyTransform(Su, 1, 1);
assertClose(psu[0].toNumber(), 2, 1e-15, 'scale uniform: x scaled');
assertClose(psu[1].toNumber(), 2, 1e-15, 'scale uniform: y scaled');

// Rotation
const R2d = Transforms2D.rotate(Math.PI / 2);
const pr = Transforms2D.applyTransform(R2d, 1, 0);
assertClose(pr[0].toNumber(), 0, 1e-10, 'rotate 90°: x=0');
assertClose(pr[1].toNumber(), 1, 1e-10, 'rotate 90°: y=1');

// Rotation around point
const Rpt = Transforms2D.rotateAroundPoint(Math.PI / 2, 1, 1);
const prp = Transforms2D.applyTransform(Rpt, 2, 1);
assertClose(prp[0].toNumber(), 1, 1e-10, 'rotateAroundPoint: x correct');
assertClose(prp[1].toNumber(), 2, 1e-10, 'rotateAroundPoint: y correct');

// Skew
const Sk = Transforms2D.skew(1, 0);
const psk = Transforms2D.applyTransform(Sk, 1, 1);
assertClose(psk[0].toNumber(), 2, 1e-15, 'skew: x = x + ax*y');
assertClose(psk[1].toNumber(), 1, 1e-15, 'skew: y unchanged');

// Stretch along axis
const St = Transforms2D.stretchAlongAxis(1, 0, 2);
const pst = Transforms2D.applyTransform(St, 1, 1);
assertClose(pst[0].toNumber(), 2, 1e-15, 'stretchAlongAxis: stretched in x');
assertClose(pst[1].toNumber(), 1, 1e-15, 'stretchAlongAxis: y unchanged');

// Reflections
const Rx = Transforms2D.reflectX();
const prx = Transforms2D.applyTransform(Rx, 1, 2);
assertClose(prx[0].toNumber(), 1, 1e-15, 'reflectX: x unchanged');
assertClose(prx[1].toNumber(), -2, 1e-15, 'reflectX: y flipped');

const Ry = Transforms2D.reflectY();
const pry = Transforms2D.applyTransform(Ry, 1, 2);
assertClose(pry[0].toNumber(), -1, 1e-15, 'reflectY: x flipped');
assertClose(pry[1].toNumber(), 2, 1e-15, 'reflectY: y unchanged');

const Ro = Transforms2D.reflectOrigin();
const pro = Transforms2D.applyTransform(Ro, 1, 2);
assertClose(pro[0].toNumber(), -1, 1e-15, 'reflectOrigin: x flipped');
assertClose(pro[1].toNumber(), -2, 1e-15, 'reflectOrigin: y flipped');

// Transform composition and inverse
const Combined = T2d.mul(R2d).mul(S2d);
const pc = Transforms2D.applyTransform(Combined, 1, 0);
const CombinedInv = Combined.inverse();
const pcBack = Transforms2D.applyTransform(CombinedInv, ...pc);
assertClose(pcBack[0].toNumber(), 1, 1e-10, 'composition inverse: x restored');
assertClose(pcBack[1].toNumber(), 0, 1e-10, 'composition inverse: y restored');

console.log('\n=== Transforms3D Tests ===\n');

// Translation
const T3d = Transforms3D.translation(1, 2, 3);
const pt3 = Transforms3D.applyTransform(T3d, 0, 0, 0);
assertClose(pt3[0].toNumber(), 1, 1e-15, 'translation 3D: x');
assertClose(pt3[1].toNumber(), 2, 1e-15, 'translation 3D: y');
assertClose(pt3[2].toNumber(), 3, 1e-15, 'translation 3D: z');

// Scale 3D
const S3d = Transforms3D.scale(2, 3, 4);
const ps3 = Transforms3D.applyTransform(S3d, 1, 1, 1);
assertClose(ps3[0].toNumber(), 2, 1e-15, 'scale 3D: x');
assertClose(ps3[1].toNumber(), 3, 1e-15, 'scale 3D: y');
assertClose(ps3[2].toNumber(), 4, 1e-15, 'scale 3D: z');

// Uniform scale 3D
const Su3 = Transforms3D.scale(5);
const psu3 = Transforms3D.applyTransform(Su3, 1, 1, 1);
assertClose(psu3[0].toNumber(), 5, 1e-15, 'scale 3D uniform: x');
assertClose(psu3[1].toNumber(), 5, 1e-15, 'scale 3D uniform: y');
assertClose(psu3[2].toNumber(), 5, 1e-15, 'scale 3D uniform: z');

// Rotate X (90°): Y -> Z, Z -> -Y
const Rx3 = Transforms3D.rotateX(Math.PI / 2);
const prx3 = Transforms3D.applyTransform(Rx3, 0, 1, 0);
assertClose(prx3[0].toNumber(), 0, 1e-10, 'rotateX 90°: x unchanged');
assertClose(prx3[1].toNumber(), 0, 1e-10, 'rotateX 90°: y -> 0');
assertClose(prx3[2].toNumber(), 1, 1e-10, 'rotateX 90°: z = 1');

// Rotate Y (90°): Z -> X, X -> -Z
const Ry3 = Transforms3D.rotateY(Math.PI / 2);
const pry3 = Transforms3D.applyTransform(Ry3, 0, 0, 1);
assertClose(pry3[0].toNumber(), 1, 1e-10, 'rotateY 90°: z -> x');
assertClose(pry3[1].toNumber(), 0, 1e-10, 'rotateY 90°: y unchanged');
assertClose(pry3[2].toNumber(), 0, 1e-10, 'rotateY 90°: z -> 0');

// Rotate Z (90°): X -> Y, Y -> -X
const Rz3 = Transforms3D.rotateZ(Math.PI / 2);
const prz3 = Transforms3D.applyTransform(Rz3, 1, 0, 0);
assertClose(prz3[0].toNumber(), 0, 1e-10, 'rotateZ 90°: x -> 0');
assertClose(prz3[1].toNumber(), 1, 1e-10, 'rotateZ 90°: y = 1');
assertClose(prz3[2].toNumber(), 0, 1e-10, 'rotateZ 90°: z unchanged');

// Rotate around arbitrary axis (identity when angle=0)
const Raxis0 = Transforms3D.rotateAroundAxis(1, 1, 1, 0);
const pra0 = Transforms3D.applyTransform(Raxis0, 1, 2, 3);
assertClose(pra0[0].toNumber(), 1, 1e-10, 'rotateAroundAxis θ=0: x unchanged');
assertClose(pra0[1].toNumber(), 2, 1e-10, 'rotateAroundAxis θ=0: y unchanged');
assertClose(pra0[2].toNumber(), 3, 1e-10, 'rotateAroundAxis θ=0: z unchanged');

// Rotate around axis: 360° should return to original
const Raxis360 = Transforms3D.rotateAroundAxis(1, 0, 0, 2 * Math.PI);
const pra360 = Transforms3D.applyTransform(Raxis360, 1, 2, 3);
assertClose(pra360[0].toNumber(), 1, 1e-10, 'rotateAroundAxis 360°: x back');
assertClose(pra360[1].toNumber(), 2, 1e-10, 'rotateAroundAxis 360°: y back');
assertClose(pra360[2].toNumber(), 3, 1e-10, 'rotateAroundAxis 360°: z back');

// Rotate around point
const Rpt3 = Transforms3D.rotateAroundPoint(0, 0, 1, Math.PI / 2, 1, 0, 0);
const prp3 = Transforms3D.applyTransform(Rpt3, 2, 0, 0);
assertClose(prp3[0].toNumber(), 1, 1e-10, 'rotateAroundPoint 3D: x');
assertClose(prp3[1].toNumber(), 1, 1e-10, 'rotateAroundPoint 3D: y');
assertClose(prp3[2].toNumber(), 0, 1e-10, 'rotateAroundPoint 3D: z');

// Reflections
const RfXY = Transforms3D.reflectXY();
const prfxy = Transforms3D.applyTransform(RfXY, 1, 2, 3);
assertClose(prfxy[0].toNumber(), 1, 1e-15, 'reflectXY: x unchanged');
assertClose(prfxy[1].toNumber(), 2, 1e-15, 'reflectXY: y unchanged');
assertClose(prfxy[2].toNumber(), -3, 1e-15, 'reflectXY: z flipped');

const RfXZ = Transforms3D.reflectXZ();
const prfxz = Transforms3D.applyTransform(RfXZ, 1, 2, 3);
assertClose(prfxz[0].toNumber(), 1, 1e-15, 'reflectXZ: x unchanged');
assertClose(prfxz[1].toNumber(), -2, 1e-15, 'reflectXZ: y flipped');
assertClose(prfxz[2].toNumber(), 3, 1e-15, 'reflectXZ: z unchanged');

const RfYZ = Transforms3D.reflectYZ();
const prfyz = Transforms3D.applyTransform(RfYZ, 1, 2, 3);
assertClose(prfyz[0].toNumber(), -1, 1e-15, 'reflectYZ: x flipped');
assertClose(prfyz[1].toNumber(), 2, 1e-15, 'reflectYZ: y unchanged');
assertClose(prfyz[2].toNumber(), 3, 1e-15, 'reflectYZ: z unchanged');

const RfO3 = Transforms3D.reflectOrigin();
const prfo3 = Transforms3D.applyTransform(RfO3, 1, 2, 3);
assertClose(prfo3[0].toNumber(), -1, 1e-15, 'reflectOrigin 3D: x flipped');
assertClose(prfo3[1].toNumber(), -2, 1e-15, 'reflectOrigin 3D: y flipped');
assertClose(prfo3[2].toNumber(), -3, 1e-15, 'reflectOrigin 3D: z flipped');

// Composition and inverse
const Combined3 = T3d.mul(Rx3).mul(S3d);
const pc3 = Transforms3D.applyTransform(Combined3, 1, 0, 0);
const Combined3Inv = Combined3.inverse();
const pc3Back = Transforms3D.applyTransform(Combined3Inv, ...pc3);
assertClose(pc3Back[0].toNumber(), 1, 1e-10, 'composition 3D inverse: x restored');
assertClose(pc3Back[1].toNumber(), 0, 1e-10, 'composition 3D inverse: y restored');
assertClose(pc3Back[2].toNumber(), 0, 1e-10, 'composition 3D inverse: z restored');

console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
