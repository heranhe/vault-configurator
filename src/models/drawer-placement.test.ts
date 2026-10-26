import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { partsOf, type Part } from '../core/parts';
import { resolveFile } from '../core/catalog';
import { decodeMesh } from './mesh-codec';
import { placePartGeometry } from './placement';
import { splitPieces } from './split';
import { DEPTHS, WIDTHS, heightsFor } from '../core/dims';
import manifest from '../../public/demo-models/manifest.json';

const drawer = { type: 'drawer', width: 'S', depth: 5, height: 1, interior: 'empty' } as const;
function geometry(part: Part) {
  const path = resolveFile(part.files[0].path)!.p;
  const entry = manifest.files[path as keyof typeof manifest.files];
  const bytes = gunzipSync(readFileSync(new URL(`../../public/demo-models/${entry.file}`, import.meta.url)));
  const data = decodeMesh(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geo.rotateZ(data.angleZ);
  geo.computeBoundingBox();
  return geo;
}

// 体验模型网格不随 Git 仓库发布（来自付费模型包，见 docs/preview-models.md）；本地没有时跳过，用 npm run demo-models 生成
const hasModels = Object.values(manifest.files).every((e) => existsSync(new URL(`../../public/demo-models/${e.file}`, import.meta.url)));
describe.skipIf(!hasModels)('抽屉真实预览网格逐件验证', () => {
  it('成套齿条、滑块、导槽和弹簧确实能从发布网格拆成两件，不重复显示整个摆盘', () => {
    for (const id of ['geared-rails', 'runner-slides', 'runners', 'springs']) {
      const part = partsOf(drawer).find((p) => p.id === id)!;
      const geo = geometry(part), pieces = splitPieces(geo, 2);
      expect(pieces, id).toHaveLength(2);
      const placed = placePartGeometry(part, geo);
      expect(placed, id).toHaveLength(2);
      expect(placed[0].g).not.toBe(placed[1].g);
    }
  });

  it('上下齿条独立摆正，齿面相向；不缩放原始模型', () => {
    const part = partsOf(drawer).find((p) => p.id === 'geared-rails')!;
    const [lower, upper] = placePartGeometry(part, geometry(part));
    expect(new THREE.Vector3(0, 1, 0).transformDirection(lower.m).y).toBeCloseTo(1);
    expect(new THREE.Vector3(0, 1, 0).transformDirection(upper.m).y).toBeCloseTo(-1);
    for (const piece of [lower, upper]) {
      const scale = new THREE.Vector3().setFromMatrixScale(piece.m);
      expect(scale.toArray()).toEqual([1, 1, 1]);
      expect(piece.g.boundingBox!.getSize(new THREE.Vector3()).x).toBeCloseTo(121.045, 1);
    }
    const low = lower.g.boundingBox!.clone().applyMatrix4(lower.m);
    const high = upper.g.boundingBox!.clone().applyMatrix4(upper.m);
    expect(high.min.y).toBeGreaterThan(low.max.y);
  });

  it('钥匙帽与两颗限位块各自有真实网格，限位块左右位置不同', () => {
    for (const id of ['key-cap', 'runner-stoppers']) {
      const part = partsOf(drawer).find((p) => p.id === id)!;
      const geo = geometry(part), placed = placePartGeometry(part, geo);
      expect(placed).toHaveLength(id === 'key-cap' ? 1 : 2);
      if (id === 'runner-stoppers') {
        const centers = placed.map(({ g, m }) => g.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(m));
        expect(centers[1].x - centers[0].x).toBeGreaterThan(140);
      }
    }
  });

  it('钥匙帽内腔朝向钥匙锁，握柄端面在帽内底面就位，保持原始尺寸', () => {
    const original = partsOf(drawer);
    const keyGeometry = geometry(original.find((p) => p.id === 'key')!);
    const capGeometry = geometry(original.find((p) => p.id === 'key-cap')!);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    for (const width of WIDTHS) for (const depth of DEPTHS) for (const height of heightsFor(width)) {
      const parts = partsOf({ ...drawer, width, depth, height });
      const key = placePartGeometry(parts.find((p) => p.id === 'key')!, keyGeometry)[0];
      const cap = placePartGeometry(parts.find((p) => p.id === 'key-cap')!, capGeometry)[0];
      // Key Cap STL 的开口沿局部 +Z；装配后应朝场景 -Z，正对钥匙握柄。
      expect(new THREE.Vector3(0, 0, 1).transformDirection(cap.m).z).toBeCloseTo(-1);
      expect(new THREE.Vector3().setFromMatrixScale(cap.m).toArray()).toEqual([1, 1, 1]);
      const capBox = cap.g.boundingBox!.clone().applyMatrix4(cap.m);
      const center = capBox.getCenter(new THREE.Vector3());
      const keyMesh = new THREE.Mesh(key.g, material), capMesh = new THREE.Mesh(cap.g, material);
      keyMesh.applyMatrix4(key.m); capMesh.applyMatrix4(cap.m);
      keyMesh.updateMatrixWorld(true); capMesh.updateMatrixWorld(true);
      // 由帽口向内发射：穿过开口后才应命中帽内底面。
      const pocket = new THREE.Raycaster(new THREE.Vector3(center.x, center.y, capBox.min.z - 1), new THREE.Vector3(0, 0, 1)).intersectObject(capMesh)[0];
      const tip = new THREE.Raycaster(new THREE.Vector3(center.x, center.y, capBox.max.z + 1), new THREE.Vector3(0, 0, -1)).intersectObject(keyMesh)[0];
      expect(pocket).toBeDefined(); expect(tip).toBeDefined();
      expect(pocket.point.z - capBox.min.z).toBeCloseTo(9.67, 1);
      expect(pocket.point.z - tip.point.z).toBeCloseTo(0, 1);
      expect(capBox.max.z - pocket.point.z).toBeCloseTo(2, 1);
    }
    material.dispose(); keyGeometry.dispose(); capGeometry.dispose();
  });
});
