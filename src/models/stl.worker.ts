// 在 Worker 里解析 STL 并简化：原始模型 50 万~670 万面，直接渲染会卡死。
// 用「顶点聚类」简化：把顶点吸到边长 cell 的网格上，合并同格顶点、丢掉退化三角形。O(n)，几秒内完成。

export type SimplifyRequest = { id: number; buffer: ArrayBuffer; cell?: number; autoZ?: boolean };
export type SimplifyResult = {
  id: number;
  positions: Float32Array;
  indices: Uint32Array;
  srcTris: number;
  angleZ: number; // 绕 Z 轴把斜放零件摆正所需的角度（弧度）
  error?: string;
};

function readTriangles(buf: ArrayBuffer): Float32Array {
  const dv = new DataView(buf);
  const n = dv.getUint32(80, true);
  if (84 + n * 50 === buf.byteLength) {
    const out = new Float32Array(n * 9);
    for (let i = 0, o = 84 + 12; i < n; i++, o += 50) for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + k * 4, true);
    return out;
  }
  // ASCII STL
  const text = new TextDecoder().decode(buf);
  const nums = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [+m[1], +m[2], +m[3]]);
  return new Float32Array(nums);
}

/** 求绕 Z 旋转多少度能让 XY 包围盒面积最小（把 45° 斜放的零件摆正） */
function bestAngleZ(v: Float32Array): number {
  const step = Math.max(3, Math.floor(v.length / 3 / 20000)) * 3;
  const area = (a: number) => {
    const c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < v.length; i += step) {
      const x = v[i] * c - v[i + 1] * s, y = v[i] * s + v[i + 1] * c;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return (x1 - x0) * (y1 - y0);
  };
  const a0 = area(0);
  let best = 0, bestA = a0;
  for (let d = 1; d < 90; d++) {
    const a = area((d * Math.PI) / 180);
    if (a < bestA) { bestA = a; best = d; }
  }
  // 只有明显斜放（面积小 15% 以上）才摆正，避免把不规则小零件转歪
  if (best === 0 || bestA > a0 * 0.85) return 0;
  let lo = ((best - 1) * Math.PI) / 180, hi = ((best + 1) * Math.PI) / 180;
  for (let i = 0; i < 30; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (area(m1) < area(m2)) hi = m2; else lo = m1;
  }
  return (lo + hi) / 2;
}

function simplify(v: Float32Array, cellArg?: number) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = v[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const maxDim = Math.max(x1 - x0, y1 - y0, z1 - z0);
  const cell = cellArg ?? Math.min(1.6, Math.max(0.35, maxDim / 260));
  const nx = Math.ceil((x1 - x0) / cell) + 2, ny = Math.ceil((y1 - y0) / cell) + 2;

  const map = new Map<number, number>();
  const sum: number[] = [];
  const cnt: number[] = [];
  const idx: number[] = [];
  const tri = [0, 0, 0];
  for (let t = 0; t < v.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      const o = t + k * 3;
      const key = Math.floor((v[o] - x0) / cell) + nx * (Math.floor((v[o + 1] - y0) / cell) + ny * Math.floor((v[o + 2] - z0) / cell));
      let id = map.get(key);
      if (id === undefined) {
        id = cnt.length;
        map.set(key, id);
        sum.push(0, 0, 0);
        cnt.push(0);
      }
      sum[id * 3] += v[o]; sum[id * 3 + 1] += v[o + 1]; sum[id * 3 + 2] += v[o + 2];
      cnt[id]++;
      tri[k] = id;
    }
    if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) idx.push(tri[0], tri[1], tri[2]);
  }
  const positions = new Float32Array(cnt.length * 3);
  for (let i = 0; i < cnt.length; i++) {
    positions[i * 3] = sum[i * 3] / cnt[i];
    positions[i * 3 + 1] = sum[i * 3 + 1] / cnt[i];
    positions[i * 3 + 2] = sum[i * 3 + 2] / cnt[i];
  }
  return { positions, indices: new Uint32Array(idx) };
}

self.onmessage = (e: MessageEvent<SimplifyRequest>) => {
  const { id, buffer, cell, autoZ } = e.data;
  try {
    const v = readTriangles(buffer);
    const angleZ = autoZ ? bestAngleZ(v) : 0;
    const { positions, indices } = simplify(v, cell);
    const res: SimplifyResult = { id, positions, indices, srcTris: v.length / 9, angleZ };
    (self as unknown as Worker).postMessage(res, [positions.buffer, indices.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
