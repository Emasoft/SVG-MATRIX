import Decimal from 'decimal.js';
import { Matrix, Vector, Transforms2D, Transforms3D } from '../src/index.js';

Decimal.set({ precision: 80 });

// Vector operations
const v = Vector.from(['1.234567890123456789', '2.34567890123456789', '3.4567890123456789']);
const w = Vector.from(['3.333333333333333333', '4.444444444444444444', '5.555555555555555555']);
console.log('v =', v.toStringArray());
console.log('w =', w.toStringArray());
console.log('dot(v,w) =', v.dot(w).toString());
console.log('v cross w =', v.cross(w).toStringArray());
console.log('v norm =', v.norm().toString());
console.log('normalized v =', v.normalize().toStringArray());
console.log('angle(v,w) =', v.angleBetween(w).toString());

// Matrix * vector
const M = Matrix.from([[1.5, 0, 0], [0, 2.5, 0], [0, 0, 3.5]]);
const mv = M.applyToVector(v);
console.log('M * v =', mv.toStringArray());

// 2D transforms: concatenation and inverse
const T = Transforms2D.translation(2, 3);
const R = Transforms2D.rotate(Math.PI / 4);
const S = Transforms2D.scale('1.5');
const M2 = T.mul(R).mul(S);
console.log('Combined 2D M2:', M2.toArrayOfStrings());
const p = [1, 0];
const p2 = Transforms2D.applyTransform(M2, ...p);
console.log('Point', p, '->', p2.map(x => x.toString()));
const Minv = M2.inverse();
const pBack = Transforms2D.applyTransform(Minv, ...p2);
console.log('Back:', pBack.map(x => x.toString()));

// 3D example
const R3 = Transforms3D.rotateAroundAxis(1, 1, 0, Math.PI / 3);
const T3 = Transforms3D.translation('0.5', '1.2', '3.4');
const M3 = T3.mul(R3);
console.log('3D transform M3:', M3.toArrayOfStrings());

// Matrix exponential example (2x2 rot generator)
const A = Matrix.from([[0, -1], [1, 0]]);
const expA = A.exp();
console.log('exp(A) approx rotation:', expA.toArrayOfStrings());

// Solve linear system
const B = Matrix.from([[4, 7], [2, 6]]);
const bvec = [1, 1];
const x = B.solve(bvec);
console.log('Solution x for B x = b:', x.toStringArray());