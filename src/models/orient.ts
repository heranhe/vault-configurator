// 把「按打印方向导出」的 STL 摆成装配方向，并放进代理模型对应的位置。
// 做法：①斜放的零件先绕 Z 摆正（Worker 求出角度）②在 24 种 90° 旋转里，
// 选出包围盒长宽高顺序与代理块一致、且离该零件「基准朝向」最近的那个 ③包围盒中心对齐到代理块中心。
import * as THREE from 'three';
import type { Block } from '../core/parts';

const deg = Math.PI / 180;

/** 24 种轴对齐旋转 */
const ROTATIONS: THREE.Matrix4[] = (() => {
  const out: THREE.Matrix4[] = [];
  const seen = new Set<string>();
  const angles = [0, 90, 180, 270];
  for (const x of angles)
    for (const y of angles)
      for (const z of angles) {
        const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x * deg, y * deg, z * deg, 'XYZ'));
        const key = m.elements.map((v) => Math.round(v)).join(',');
        if (!seen.has(key)) {
          seen.add(key);
          out.push(m.clone());
        }
      }
  return out;
})();

const rank = (v: THREE.Vector3) => {
  const a = [v.x, v.y, v.z];
  return a.map((x) => a.filter((y) => y < x - 0.5).length).join('');
};

/** 两个旋转之间的夹角（用于在候选中挑离基准最近的） */
function angleBetween(a: THREE.Matrix4, b: THREE.Matrix4) {
  const qa = new THREE.Quaternion().setFromRotationMatrix(a);
  const qb = new THREE.Quaternion().setFromRotationMatrix(b);
  return qa.angleTo(qb);
}

export type OrientHint = {
  /** 基准朝向（度，XYZ 欧拉角）：同等匹配时优先选离它最近的旋转 */
  base?: [number, number, number];
  /** 在选出的旋转之后再追加的翻转（度），用于修正正反面 */
  post?: [number, number, number];
};

/**
 * 计算把几何体（已绕 Z 摆正、尚未平移）放进代理块的变换矩阵。
 * geoBox：几何体自身的包围盒。
 */
export function fitToBlock(geoBox: THREE.Box3, block: Block, hint: OrientHint = {}): THREE.Matrix4 {
  const size = new THREE.Vector3();
  geoBox.getSize(size);
  const target = new THREE.Vector3(...block.size);
  const targetRank = rank(target);
  const base = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(hint.base ?? [0, 0, 0]).map((d) => d * deg) as [number, number, number], 'XYZ'));

  let best: THREE.Matrix4 | null = null;
  let bestScore = Infinity;
  for (const r of ROTATIONS) {
    const s = size.clone().applyMatrix4(new THREE.Matrix4().extractRotation(r));
    s.set(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
    const mismatch = rank(s) === targetRank ? 0 : 1000;
    const score = mismatch + angleBetween(r, base);
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  const rot = best!.clone();
  if (hint.post) rot.premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...hint.post.map((d) => d * deg) as [number, number, number], 'XYZ')));

  // 旋转后的包围盒中心 → 代理块中心
  const rotated = geoBox.clone().applyMatrix4(rot);
  const c = new THREE.Vector3();
  rotated.getCenter(c);
  const blockCenter = new THREE.Vector3(block.at[0] + block.size[0] / 2, block.at[1] + block.size[1] / 2, block.at[2] + block.size[2] / 2);
  return new THREE.Matrix4().makeTranslation(blockCenter.x - c.x, blockCenter.y - c.y, blockCenter.z - c.z).multiply(rot);
}
