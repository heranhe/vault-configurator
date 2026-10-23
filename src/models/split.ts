// 一个打印文件里并排放着多件同样的零件（左右导轨、一对铰链……），按连通块拆开，装配时各放各的位置
import * as THREE from 'three';

const cache = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry[]>>();

/**
 * 拆成 n 件：取三角形最多的 n 个连通块作为主体，其余碎块（简化产生的）并入中心最近的主体。
 * 结果按主体沿「分得最开的那条轴」从小到大排序，保证同一文件每次拆出的顺序一致。
 */
export function splitPieces(geo: THREE.BufferGeometry, n: number): THREE.BufferGeometry[] {
  let byN = cache.get(geo);
  if (!byN) cache.set(geo, (byN = new Map()));
  const hit = byN.get(n);
  if (hit) return hit;

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const index = geo.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const vert = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);

  // 并查集：共用顶点的三角形属于同一件。toCreasedNormals 之后顶点不再共用，所以按坐标合并
  const parent = new Int32Array(pos.count).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const byPos = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 100)},${Math.round(pos.getY(i) * 100)},${Math.round(pos.getZ(i) * 100)}`;
    const j = byPos.get(key);
    if (j === undefined) byPos.set(key, i);
    else parent[find(i)] = find(j);
  }
  for (let t = 0; t < triCount; t++) {
    const a = find(vert(t, 0));
    parent[find(vert(t, 1))] = a;
    parent[find(vert(t, 2))] = a;
  }

  const groups = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const r = find(vert(t, 0));
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(t);
  }
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
  if (sorted.length < n) {
    byN.set(n, [geo]);
    return [geo];
  }

  const center = (tris: number[]) => {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const t of tris) for (let k = 0; k < 3; k++) box.expandByPoint(v.fromBufferAttribute(pos, vert(t, k)));
    return box.getCenter(new THREE.Vector3());
  };
  const mains = sorted.slice(0, n).map((tris) => ({ tris: [...tris], c: center(tris) }));
  for (const rest of sorted.slice(n)) {
    const c = center(rest);
    mains.reduce((a, b) => (a.c.distanceToSquared(c) <= b.c.distanceToSquared(c) ? a : b)).tris.push(...rest);
  }
  const spread = (k: 'x' | 'y' | 'z') => Math.max(...mains.map((m) => m.c[k])) - Math.min(...mains.map((m) => m.c[k]));
  const axis = (['x', 'y', 'z'] as const).reduce((a, b) => (spread(a) >= spread(b) ? a : b));
  mains.sort((a, b) => a.c[axis] - b.c[axis]);

  const normal = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const out = mains.map(({ tris }) => {
    const p = new Float32Array(tris.length * 9);
    const nn = normal ? new Float32Array(tris.length * 9) : null;
    tris.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const s = vert(t, k), o = i * 9 + k * 3;
        p[o] = pos.getX(s); p[o + 1] = pos.getY(s); p[o + 2] = pos.getZ(s);
        if (nn && normal) { nn[o] = normal.getX(s); nn[o + 1] = normal.getY(s); nn[o + 2] = normal.getZ(s); }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (nn) g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    else g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  });
  byN.set(n, out);
  return out;
}
