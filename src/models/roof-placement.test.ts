import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEPTHS, WIDTHS, dimsOf } from '../core/dims';
import { partsOf } from '../core/parts';
import { placePartGeometry } from './placement';

// 原始 Top Handle STL 的实测包围盒与连接轴，测试无需复制用户的打印文件。
const sourceSize = new THREE.Vector3(50.99902344, 37.08129883, 125.9834938);
const envelope = new THREE.BoxGeometry(...sourceSize.toArray()).translate(...sourceSize.clone().multiplyScalar(0.5).toArray());
envelope.computeBoundingBox();

describe('栅格顶盖提手装配方向', () => {
  it('穿手孔朝前后，底座朝下并贴住顶盖，保持原始尺寸', () => {
    for (const width of WIDTHS) for (const depth of DEPTHS) {
      const spec = { type: 'roof', width, depth, roof: 'grid' } as const;
      const { w, h, d } = dimsOf(spec);
      const handle = partsOf(spec).find((p) => p.id === 'handle')!;
      const [{ m }] = placePartGeometry(handle, envelope);
      expect(new THREE.Vector3(1, 0, 0).transformDirection(m).y).toBeCloseTo(-1);
      expect(new THREE.Vector3(0, 1, 0).transformDirection(m).z).toBeCloseTo(1);
      const foot = new THREE.Vector3(sourceSize.x, sourceSize.y / 2, sourceSize.z / 2).applyMatrix4(m);
      expect(foot.x).toBeCloseTo(w / 2, 3);
      expect(foot.y).toBeCloseTo(h, 2);
      expect(foot.z).toBeCloseTo(d / 2, 3);
      expect(new THREE.Vector3().setFromMatrixScale(m).toArray()).toEqual([1, 1, 1]);
    }
  });

  it('两颗 M6×50 沿原始模型的 45° 斜孔进入顶盖，没有伸出提手上方', () => {
    for (const width of WIDTHS) for (const depth of DEPTHS) {
      const spec = { type: 'roof', width, depth, roof: 'grid' } as const;
      const { h } = dimsOf(spec), parts = partsOf(spec);
      const handle = parts.find((p) => p.id === 'handle')!;
      const [{ m }] = placePartGeometry(handle, envelope);
      const inverse = m.clone().invert();
      const bolts = parts.find((p) => p.id === 'handle-bolts')!;
      expect(bolts.blocks).toHaveLength(2);
      for (const b of bolts.blocks) {
        const vector = new THREE.Vector3(...b.cylVector!);
        expect(vector.length()).toBeCloseTo(50, 5);
        const center = new THREE.Vector3(...b.at).add(new THREE.Vector3(...b.size).multiplyScalar(0.5)).applyMatrix4(inverse);
        const axis = vector.normalize().transformDirection(inverse);
        expect(axis.x).toBeCloseTo(Math.SQRT1_2, 5);
        expect(Math.abs(axis.z)).toBeCloseTo(Math.SQRT1_2, 5);
        // 两条孔轴实测为 X-Z=12.6582、X+Z=138.6417，Y=19.025。
        const cross = axis.z > 0 ? center.x - center.z : center.x + center.z;
        expect(cross).toBeCloseTo(axis.z > 0 ? 12.6582 : 138.6417, 1);
        expect(center.y).toBeCloseTo(19.025, 2);
        expect(b.at[1]).toBeGreaterThan(0);
        expect(b.at[1]).toBeLessThan(h);
        expect(b.at[1] + b.size[1]).toBeLessThan(h + sourceSize.x);
      }
    }
  });
});
