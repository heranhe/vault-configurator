import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEPTHS, WIDTHS, dimsOf } from '../core/dims';
import { partsOf } from '../core/parts';
import { placePartGeometry } from './placement';

const envelope = (size: [number, number, number]) => {
  const g = new THREE.BoxGeometry(...size).translate(size[0] / 2, size[1] / 2, size[2] / 2);
  g.computeBoundingBox(); return g;
};

describe('底座安装面、支脚和轮轴标定', () => {
  it.each(WIDTHS)('%s 安装槽朝上，轴孔与全部轮组同轴，支脚安装面朝上并落地', (width) => {
    for (const depth of DEPTHS) for (const mode of ['wheels', 'feet'] as const) {
      const spec = { type: 'base', width, depth, mode } as const;
      const { w, d } = dimsOf(spec), parts = partsOf(spec);
      const base = parts.find((p) => p.id === 'base')!;
      // 原始 STL 实测：S/M 槽面朝 -Y，L/XL 摆正后槽面朝 +X；孔心距底面20、后沿30。
      const narrow = width === 'S' || width === 'M';
      const source = envelope(narrow ? [w, 52.208, d + 10] : [52.208, w, d + 10]);
      const [{ m }] = placePartGeometry(base, source);
      expect(new THREE.Vector3(...(narrow ? [0, -1, 0] : [1, 0, 0]) as [number, number, number]).transformDirection(m).y).toBeCloseTo(1);
      const axis = new THREE.Vector3(...(narrow ? [w / 2, 32.208, 30] : [20, w / 2, 30]) as [number, number, number]).applyMatrix4(m);
      expect(axis.y).toBeCloseTo(80, 1); expect(axis.z).toBeCloseTo(25, 1);
      const foot = parts.find((p) => p.id === 'feet')!;
      const fg = envelope([w - 60, 92, 60.5]);
      const placed = placePartGeometry(foot, fg);
      for (const { m: fm } of placed) {
        expect(new THREE.Vector3(0, 0, -1).transformDirection(fm).y).toBeCloseTo(1);
        const box = fg.boundingBox!.clone().applyMatrix4(fm);
        expect(box.min.y).toBeCloseTo(0, 5);
        expect(box.max.y).toBeCloseTo(60.5, 5);
        const center = box.getCenter(new THREE.Vector3());
        const front = center.z > d / 2;
        expect(new THREE.Vector3(0, -1, 0).transformDirection(fm).z).toBeCloseTo(front ? 1 : -1);
      }
      if (mode === 'wheels') for (const id of ['wheels', 'wheel-disks', 'wheel-covers', 'wheel-bushings', 'wheel-axle', 'wheel-bearings', 'wheel-collars']) {
        for (const b of parts.find((p) => p.id === id)!.blocks) {
          expect(b.at[1] + b.size[1] / 2, id).toBeCloseTo(axis.y, 1);
          expect(b.at[2] + b.size[2] / 2, id).toBeCloseTo(axis.z, 1);
          if (id === 'wheels') expect(b.at[1]).toBeCloseTo(0, 5);
        }
      }
      source.dispose(); fg.dispose();
    }
  });
});
