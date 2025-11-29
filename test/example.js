import { Matrix, Decimal } from '../src/index.js';

Decimal.set({ precision: 40 });

const A = Matrix.from([[1.234567890123456789, 2.34567890123456789], [3.4567890123456789, 4.567890123456789]]);
console.log('A:', A.toArrayOfStrings());

const det = A.determinant();
console.log('det(A):', det.toString());

const inv = A.inverse();
console.log('inv(A):', inv.toArrayOfStrings());

const x = A.solve([1, 2]);
console.log('solution x for Ax=[1,2]:', x.toArrayOfStrings());

const B = Matrix.from([[1, 0], [0, 1]]);
console.log('A * inv(A):', A.mul(inv).toArrayOfStrings());