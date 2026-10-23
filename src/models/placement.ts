import * as THREE from 'three';
import type { Block, Part } from '../core/parts';
import type { Vec3 } from '../core/types';
import { fitToBlock } from './orient';
import { splitPieces } from './split';

export function unionBlock(blocks: Block[]): Block {
  const min = [0, 1, 2].map((k) => Math.min(...blocks.map((b) => b.at[k])));
  const max = [0, 1, 2].map((k) => Math.max(...blocks.map((b) => b.at[k] + b.size[k])));
  return { at: min as Vec3, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

const straightened = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** 成套摆盘的细长件分别求最小 XY 包围盒，消除整套自动摆正引入的斜轴。 */
function straighten(geo: THREE.BufferGeometry) {
  const hit = straightened.get(geo);
  if (hit) return hit;
  const center = geo.boundingBox!.getCenter(new THREE.Vector3());
  const pos = geo.getAttribute('position');
  const area = (angle: number) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) - center.x, y = pos.getY(i) - center.y;
      const rx = x * c - y * s, ry = x * s + y * c;
      x0 = Math.min(x0, rx); x1 = Math.max(x1, rx);
      y0 = Math.min(y0, ry); y1 = Math.max(y1, ry);
    }
    return (x1 - x0) * (y1 - y0);
  };
  let angle = 0, best = area(0);
  for (const step of [1, 0.1, 0.01]) {
    const middle = angle;
    for (let d = -10; d <= 10; d++) {
      const candidate = middle + d * step * Math.PI / 180;
      const a = area(candidate);
      if (a < best) { best = a; angle = candidate; }
    }
  }
  const g = geo.clone().translate(-center.x, -center.y, -center.z).rotateZ(angle);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  straightened.set(geo, g);
  return g;
}

const shaftCenters = new WeakMap<THREE.BufferGeometry, Vec3>();

/** 在杆身中段拟合圆心，避开不对称端帽和用于免支撑打印的平底。 */
export function shaftCenter(geo: THREE.BufferGeometry): Vec3 {
  const hit = shaftCenters.get(geo);
  if (hit) return hit;
  const box = geo.boundingBox!, mid = box.getCenter(new THREE.Vector3()), length = box.max.x - box.min.x;
  const pos = geo.getAttribute('position');
  const points = new Map<string, [number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) - box.min.x) / length;
    if (x < 0.3 || x > 0.7 || pos.getZ(i) < box.min.z + 0.15) continue;
    const y = pos.getY(i) - mid.y, z = pos.getZ(i) - mid.z;
    points.set(`${Math.round(y * 100)},${Math.round(z * 100)}`, [y, z]);
  }
  const sums = new Array<number>(9).fill(0), rhs = new THREE.Vector3();
  for (const [y, z] of points.values()) {
    const a = [2 * y, 2 * z, 1], b = y * y + z * z;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) sums[i * 3 + j] += a[i] * a[j];
    rhs.add(new THREE.Vector3(a[0] * b, a[1] * b, b));
  }
  const matrix = new THREE.Matrix3().set(...sums as [number, number, number, number, number, number, number, number, number]);
  if (Math.abs(matrix.determinant()) > 1e-8) {
    const fit = rhs.applyMatrix3(matrix.invert());
    mid.y += fit.x; mid.z += fit.y;
  }
  const center = mid.toArray() as Vec3;
  shaftCenters.set(geo, center);
  return center;
}

/** 每个文件内的独立实物件各放一次；打印份数和文件内的件数分别处理。 */
export function placePartGeometry(part: Part, geo: THREE.BufferGeometry) {
  const targets = part.real === 'each' ? part.blocks : [unionBlock(part.blocks)];
  const pieces = part.split ? splitPieces(geo, part.files[0]?.pieces ?? targets.length) : [geo];
  return targets.map((b, i) => {
    const source = pieces[i % pieces.length];
    const g = part.deskew ? straighten(source) : source;
    const orient = b.flip
      ? part.orient?.rotation ? { ...part.orient, rotation: b.flip } : { ...part.orient, post: b.flip }
      : part.orient;
    return { g, m: fitToBlock(g.boundingBox!, b, part.shaft ? { ...orient, anchor: shaftCenter(g) } : orient) };
  });
}
