// 爆炸 / 安装流程的零件标注：3D 场景登记每个零件的组和锚点，HTML 标注层每帧投影到屏幕再画引线
import * as THREE from 'three';
import type { Part } from '../core/parts';

/** 爆炸距离放大倍数：零件定义里的 explode 是 t = 1 时的位移，整体再放大这么多 */
export const EXPLODE_GAIN = 2;

export type Callout = { unitId: string; partId: string; name: string; group: THREE.Group; anchor: THREE.Vector3 };

/** 键 = `${unitId}/${partId}` */
export const callouts = new Map<string, Callout>();

/** 引线指向的点：零件第一块代理块的中心（多块零件如左右导轨，指向第一块） */
export function partAnchor(part: Part) {
  const b = part.blocks[0];
  return new THREE.Vector3(b.at[0] + b.size[0] / 2, b.at[1] + b.size[1] / 2, b.at[2] + b.size[2] / 2);
}

/** 每帧由场景里的 CalloutTracker 更新：零件锚点的屏幕坐标（相对视口，px） */
export const screenAnchors = new Map<string, { x: number; y: number; visible: boolean }>();
