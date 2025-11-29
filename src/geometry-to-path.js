import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';

const D = x => (x instanceof Decimal ? x : new Decimal(x));

export function getKappa() {
  const two = new Decimal(2);
  const three = new Decimal(3);
  const four = new Decimal(4);
  return four.mul(two.sqrt().minus(1)).div(three);
}

function formatNumber(value, precision = 6) {
  return value.toDecimalPlaces(precision).toString();
}

export function circleToPathData(cx, cy, r, precision = 6) {
  const cxD = D(cx), cyD = D(cy), rD = D(r);
  const k = getKappa().mul(rD);
  const x0 = cxD.plus(rD), y0 = cyD;
  const c1x1 = x0, c1y1 = y0.minus(k), c1x2 = cxD.plus(k), c1y2 = cyD.minus(rD), x1 = cxD, y1 = cyD.minus(rD);
  const c2x1 = cxD.minus(k), c2y1 = y1, c2x2 = cxD.minus(rD), c2y2 = cyD.minus(k), x2 = cxD.minus(rD), y2 = cyD;
  const c3x1 = x2, c3y1 = cyD.plus(k), c3x2 = cxD.minus(k), c3y2 = cyD.plus(rD), x3 = cxD, y3 = cyD.plus(rD);
  const c4x1 = cxD.plus(k), c4y1 = y3, c4x2 = x0, c4y2 = cyD.plus(k);
  const f = v => formatNumber(v, precision);
  return `M ${f(x0)} ${f(y0)} C ${f(c1x1)} ${f(c1y1)} ${f(c1x2)} ${f(c1y2)} ${f(x1)} ${f(y1)} C ${f(c2x1)} ${f(c2y1)} ${f(c2x2)} ${f(c2y2)} ${f(x2)} ${f(y2)} C ${f(c3x1)} ${f(c3y1)} ${f(c3x2)} ${f(c3y2)} ${f(x3)} ${f(y3)} C ${f(c4x1)} ${f(c4y1)} ${f(c4x2)} ${f(c4y2)} ${f(x0)} ${f(y0)} Z`;
}

export function ellipseToPathData(cx, cy, rx, ry, precision = 6) {
  const cxD = D(cx), cyD = D(cy), rxD = D(rx), ryD = D(ry);
  const kappa = getKappa(), kx = kappa.mul(rxD), ky = kappa.mul(ryD);
  const x0 = cxD.plus(rxD), y0 = cyD;
  const c1x1 = x0, c1y1 = y0.minus(ky), c1x2 = cxD.plus(kx), c1y2 = cyD.minus(ryD), x1 = cxD, y1 = cyD.minus(ryD);
  const c2x1 = cxD.minus(kx), c2y1 = y1, c2x2 = cxD.minus(rxD), c2y2 = cyD.minus(ky), x2 = cxD.minus(rxD), y2 = cyD;
  const c3x1 = x2, c3y1 = cyD.plus(ky), c3x2 = cxD.minus(kx), c3y2 = cyD.plus(ryD), x3 = cxD, y3 = cyD.plus(ryD);
  const c4x1 = cxD.plus(kx), c4y1 = y3, c4x2 = x0, c4y2 = cyD.plus(ky);
  const f = v => formatNumber(v, precision);
  return `M ${f(x0)} ${f(y0)} C ${f(c1x1)} ${f(c1y1)} ${f(c1x2)} ${f(c1y2)} ${f(x1)} ${f(y1)} C ${f(c2x1)} ${f(c2y1)} ${f(c2x2)} ${f(c2y2)} ${f(x2)} ${f(y2)} C ${f(c3x1)} ${f(c3y1)} ${f(c3x2)} ${f(c3y2)} ${f(x3)} ${f(y3)} C ${f(c4x1)} ${f(c4y1)} ${f(c4x2)} ${f(c4y2)} ${f(x0)} ${f(y0)} Z`;
}

export function rectToPathData(x, y, width, height, rx = 0, ry = null, useArcs = false, precision = 6) {
  const xD = D(x), yD = D(y), wD = D(width), hD = D(height);
  let rxD = D(rx || 0), ryD = ry !== null ? D(ry) : rxD;
  const halfW = wD.div(2), halfH = hD.div(2);
  if (rxD.gt(halfW)) rxD = halfW;
  if (ryD.gt(halfH)) ryD = halfH;
  const f = v => formatNumber(v, precision);
  if (rxD.isZero() || ryD.isZero()) {
    const x1 = xD.plus(wD), y1 = yD.plus(hD);
    return `M ${f(xD)} ${f(yD)} L ${f(x1)} ${f(yD)} L ${f(x1)} ${f(y1)} L ${f(xD)} ${f(y1)} Z`;
  }
  const left = xD, right = xD.plus(wD), top = yD, bottom = yD.plus(hD);
  const leftInner = left.plus(rxD), rightInner = right.minus(rxD);
  const topInner = top.plus(ryD), bottomInner = bottom.minus(ryD);
  if (useArcs) {
    return `M ${f(leftInner)} ${f(top)} L ${f(rightInner)} ${f(top)} A ${f(rxD)} ${f(ryD)} 0 0 1 ${f(right)} ${f(topInner)} L ${f(right)} ${f(bottomInner)} A ${f(rxD)} ${f(ryD)} 0 0 1 ${f(rightInner)} ${f(bottom)} L ${f(leftInner)} ${f(bottom)} A ${f(rxD)} ${f(ryD)} 0 0 1 ${f(left)} ${f(bottomInner)} L ${f(left)} ${f(topInner)} A ${f(rxD)} ${f(ryD)} 0 0 1 ${f(leftInner)} ${f(top)} Z`;
  }
  const kappa = getKappa(), kx = kappa.mul(rxD), ky = kappa.mul(ryD);
  return `M ${f(leftInner)} ${f(top)} L ${f(rightInner)} ${f(top)} C ${f(rightInner)} ${f(top)} ${f(right)} ${f(topInner.minus(ky))} ${f(right)} ${f(topInner)} L ${f(right)} ${f(bottomInner)} C ${f(right)} ${f(bottomInner)} ${f(rightInner.plus(kx))} ${f(bottom)} ${f(rightInner)} ${f(bottom)} L ${f(leftInner)} ${f(bottom)} C ${f(leftInner)} ${f(bottom)} ${f(left)} ${f(bottomInner.plus(ky))} ${f(left)} ${f(bottomInner)} L ${f(left)} ${f(topInner)} C ${f(left)} ${f(topInner)} ${f(leftInner.minus(kx))} ${f(top)} ${f(leftInner)} ${f(top)} Z`;
}

export function lineToPathData(x1, y1, x2, y2, precision = 6) {
  const f = v => formatNumber(D(v), precision);
  return `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`;
}

function parsePoints(points) {
  if (Array.isArray(points)) return points.map(([x, y]) => [D(x), D(y)]);
  const nums = points.split(/[\s,]+/).filter(s => s.length > 0).map(s => D(s));
  const pairs = [];
  for (let i = 0; i < nums.length; i += 2) {
    if (i + 1 < nums.length) pairs.push([nums[i], nums[i + 1]]);
  }
  return pairs;
}

export function polylineToPathData(points, precision = 6) {
  const pairs = parsePoints(points);
  if (pairs.length === 0) return '';
  const f = v => formatNumber(v, precision);
  const [x0, y0] = pairs[0];
  let path = `M ${f(x0)} ${f(y0)}`;
  for (let i = 1; i < pairs.length; i++) {
    const [x, y] = pairs[i];
    path += ` L ${f(x)} ${f(y)}`;
  }
  return path;
}

export function polygonToPathData(points, precision = 6) {
  const path = polylineToPathData(points, precision);
  return path ? path + ' Z' : '';
}

export function parsePathData(pathData) {
  const commands = [];
  const commandRegex = /([MmLlHhVvCcSsQqTtAaZz])\s*([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match;
  while ((match = commandRegex.exec(pathData)) !== null) {
    const command = match[1];
    const argsStr = match[2].trim();
    const args = argsStr.length > 0 ? argsStr.split(/[\s,]+/).filter(s => s.length > 0).map(s => D(s)) : [];
    commands.push({ command, args });
  }
  return commands;
}

export function pathArrayToString(commands, precision = 6) {
  return commands.map(({ command, args }) => {
    const argsStr = args.map(a => formatNumber(a, precision)).join(' ');
    return argsStr.length > 0 ? `${command} ${argsStr}` : command;
  }).join(' ');
}

export function pathToAbsolute(pathData) {
  const commands = parsePathData(pathData);
  const result = [];
  let currentX = new Decimal(0), currentY = new Decimal(0);
  let subpathStartX = new Decimal(0), subpathStartY = new Decimal(0);
  for (const { command, args } of commands) {
    const isRelative = command === command.toLowerCase();
    const upperCmd = command.toUpperCase();
    if (upperCmd === 'M') {
      const x = isRelative ? currentX.plus(args[0]) : args[0];
      const y = isRelative ? currentY.plus(args[1]) : args[1];
      currentX = x; currentY = y; subpathStartX = x; subpathStartY = y;
      result.push({ command: 'M', args: [x, y] });
    } else if (upperCmd === 'L') {
      const x = isRelative ? currentX.plus(args[0]) : args[0];
      const y = isRelative ? currentY.plus(args[1]) : args[1];
      currentX = x; currentY = y;
      result.push({ command: 'L', args: [x, y] });
    } else if (upperCmd === 'H') {
      const x = isRelative ? currentX.plus(args[0]) : args[0];
      currentX = x;
      result.push({ command: 'L', args: [x, currentY] });
    } else if (upperCmd === 'V') {
      const y = isRelative ? currentY.plus(args[0]) : args[0];
      currentY = y;
      result.push({ command: 'L', args: [currentX, y] });
    } else if (upperCmd === 'C') {
      const x1 = isRelative ? currentX.plus(args[0]) : args[0];
      const y1 = isRelative ? currentY.plus(args[1]) : args[1];
      const x2 = isRelative ? currentX.plus(args[2]) : args[2];
      const y2 = isRelative ? currentY.plus(args[3]) : args[3];
      const x = isRelative ? currentX.plus(args[4]) : args[4];
      const y = isRelative ? currentY.plus(args[5]) : args[5];
      currentX = x; currentY = y;
      result.push({ command: 'C', args: [x1, y1, x2, y2, x, y] });
    } else if (upperCmd === 'A') {
      const x = isRelative ? currentX.plus(args[5]) : args[5];
      const y = isRelative ? currentY.plus(args[6]) : args[6];
      currentX = x; currentY = y;
      result.push({ command: 'A', args: [args[0], args[1], args[2], args[3], args[4], x, y] });
    } else if (upperCmd === 'Z') {
      currentX = subpathStartX; currentY = subpathStartY;
      result.push({ command: 'Z', args: [] });
    } else {
      result.push({ command, args });
    }
  }
  return pathArrayToString(result);
}

export function transformArcParams(rx, ry, xAxisRotation, largeArc, sweep, endX, endY, matrix) {
  const endXD = D(endX), endYD = D(endY);
  const endPoint = Matrix.from([[endXD], [endYD], [new Decimal(1)]]);
  const transformedEnd = matrix.mul(endPoint);
  const newEndX = transformedEnd.data[0][0].div(transformedEnd.data[2][0]);
  const newEndY = transformedEnd.data[1][0].div(transformedEnd.data[2][0]);
  const det = matrix.data[0][0].mul(matrix.data[1][1]).minus(matrix.data[0][1].mul(matrix.data[1][0]));
  const newSweep = det.isNegative() ? (sweep === 1 ? 0 : 1) : sweep;
  return [D(rx), D(ry), D(xAxisRotation), largeArc, newSweep, newEndX, newEndY];
}

export function transformPathData(pathData, matrix, precision = 6) {
  const absPath = pathToAbsolute(pathData);
  const commands = parsePathData(absPath);
  const result = [];
  for (const { command, args } of commands) {
    if (command === 'M' || command === 'L') {
      const pt = Matrix.from([[args[0]], [args[1]], [new Decimal(1)]]);
      const transformed = matrix.mul(pt);
      const x = transformed.data[0][0].div(transformed.data[2][0]);
      const y = transformed.data[1][0].div(transformed.data[2][0]);
      result.push({ command, args: [x, y] });
    } else if (command === 'C') {
      const transformedArgs = [];
      for (let i = 0; i < 6; i += 2) {
        const pt = Matrix.from([[args[i]], [args[i + 1]], [new Decimal(1)]]);
        const transformed = matrix.mul(pt);
        transformedArgs.push(transformed.data[0][0].div(transformed.data[2][0]));
        transformedArgs.push(transformed.data[1][0].div(transformed.data[2][0]));
      }
      result.push({ command, args: transformedArgs });
    } else if (command === 'A') {
      const [newRx, newRy, newRot, newLarge, newSweep, newEndX, newEndY] =
        transformArcParams(args[0], args[1], args[2], args[3], args[4], args[5], args[6], matrix);
      result.push({ command, args: [newRx, newRy, newRot, newLarge, newSweep, newEndX, newEndY] });
    } else {
      result.push({ command, args });
    }
  }
  return pathArrayToString(result, precision);
}

function quadraticToCubic(x0, y0, x1, y1, x2, y2) {
  const twoThirds = new Decimal(2).div(3);
  const cp1x = x0.plus(twoThirds.mul(x1.minus(x0)));
  const cp1y = y0.plus(twoThirds.mul(y1.minus(y0)));
  const cp2x = x2.plus(twoThirds.mul(x1.minus(x2)));
  const cp2y = y2.plus(twoThirds.mul(y1.minus(y2)));
  return [cp1x, cp1y, cp2x, cp2y, x2, y2];
}

export function pathToCubics(pathData) {
  const absPath = pathToAbsolute(pathData);
  const commands = parsePathData(absPath);
  const result = [];
  let currentX = new Decimal(0), currentY = new Decimal(0);
  let lastControlX = new Decimal(0), lastControlY = new Decimal(0);
  let lastCommand = '';
  for (const { command, args } of commands) {
    if (command === 'M') {
      currentX = args[0]; currentY = args[1];
      result.push({ command: 'M', args: [currentX, currentY] });
      lastCommand = 'M';
    } else if (command === 'L') {
      const x = args[0], y = args[1];
      result.push({ command: 'C', args: [currentX, currentY, x, y, x, y] });
      currentX = x; currentY = y;
      lastCommand = 'L';
    } else if (command === 'C') {
      const [x1, y1, x2, y2, x, y] = args;
      result.push({ command: 'C', args: [x1, y1, x2, y2, x, y] });
      lastControlX = x2; lastControlY = y2;
      currentX = x; currentY = y;
      lastCommand = 'C';
    } else if (command === 'S') {
      let x1, y1;
      if (lastCommand === 'C' || lastCommand === 'S') {
        x1 = currentX.mul(2).minus(lastControlX);
        y1 = currentY.mul(2).minus(lastControlY);
      } else {
        x1 = currentX; y1 = currentY;
      }
      const [x2, y2, x, y] = args;
      result.push({ command: 'C', args: [x1, y1, x2, y2, x, y] });
      lastControlX = x2; lastControlY = y2;
      currentX = x; currentY = y;
      lastCommand = 'S';
    } else if (command === 'Q') {
      const [x1, y1, x, y] = args;
      const cubic = quadraticToCubic(currentX, currentY, x1, y1, x, y);
      result.push({ command: 'C', args: cubic });
      lastControlX = x1; lastControlY = y1;
      currentX = x; currentY = y;
      lastCommand = 'Q';
    } else if (command === 'T') {
      let x1, y1;
      if (lastCommand === 'Q' || lastCommand === 'T') {
        x1 = currentX.mul(2).minus(lastControlX);
        y1 = currentY.mul(2).minus(lastControlY);
      } else {
        x1 = currentX; y1 = currentY;
      }
      const [x, y] = args;
      const cubic = quadraticToCubic(currentX, currentY, x1, y1, x, y);
      result.push({ command: 'C', args: cubic });
      lastControlX = x1; lastControlY = y1;
      currentX = x; currentY = y;
      lastCommand = 'T';
    } else if (command === 'Z') {
      result.push({ command: 'Z', args: [] });
      lastCommand = 'Z';
    } else {
      result.push({ command, args });
      lastCommand = command;
    }
  }
  return pathArrayToString(result);
}

export function convertElementToPath(element, precision = 6) {
  const getAttr = (name, defaultValue = 0) => {
    if (element.getAttribute) return element.getAttribute(name) || defaultValue;
    return element[name] !== undefined ? element[name] : defaultValue;
  };
  const tagName = (element.tagName || element.type || '').toLowerCase();
  if (tagName === 'circle') {
    return circleToPathData(getAttr('cx', 0), getAttr('cy', 0), getAttr('r', 0), precision);
  } else if (tagName === 'ellipse') {
    return ellipseToPathData(getAttr('cx', 0), getAttr('cy', 0), getAttr('rx', 0), getAttr('ry', 0), precision);
  } else if (tagName === 'rect') {
    return rectToPathData(getAttr('x', 0), getAttr('y', 0), getAttr('width', 0), getAttr('height', 0), getAttr('rx', 0), getAttr('ry', null), false, precision);
  } else if (tagName === 'line') {
    return lineToPathData(getAttr('x1', 0), getAttr('y1', 0), getAttr('x2', 0), getAttr('y2', 0), precision);
  } else if (tagName === 'polyline') {
    return polylineToPathData(getAttr('points', ''), precision);
  } else if (tagName === 'polygon') {
    return polygonToPathData(getAttr('points', ''), precision);
  }
  return null;
}
