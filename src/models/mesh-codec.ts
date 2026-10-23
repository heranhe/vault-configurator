// 预览网格和 OPFS 共用格式；保留 Float32 坐标，避免额外量化损失。
export type MeshData = { positions: Float32Array; indices: Uint32Array; angleZ: number };

export function encodeMesh(m: MeshData): Uint8Array {
  const out = new Uint8Array(24 + m.positions.byteLength + m.indices.byteLength);
  new Float64Array(out.buffer, 0, 3).set([m.positions.length / 3, m.indices.length, m.angleZ]);
  out.set(new Uint8Array(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength), 24);
  out.set(new Uint8Array(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength), 24 + m.positions.byteLength);
  return out;
}

export function decodeMesh(buf: ArrayBuffer): MeshData {
  if (buf.byteLength < 24) throw new Error('预览模型头部不完整');
  const [nv, ni, angleZ] = new Float64Array(buf, 0, 3);
  if (!Number.isSafeInteger(nv) || !Number.isSafeInteger(ni) || nv <= 0 || ni <= 0 || ni % 3 || !Number.isFinite(angleZ) || 24 + nv * 12 + ni * 4 !== buf.byteLength)
    throw new Error('预览模型数据无效');
  const positions = new Float32Array(buf, 24, nv * 3);
  const indices = new Uint32Array(buf, 24 + nv * 12, ni);
  for (const p of positions) if (!Number.isFinite(p)) throw new Error('预览模型坐标无效');
  for (const i of indices) if (i >= nv) throw new Error('预览模型索引越界');
  return { positions, indices, angleZ };
}
