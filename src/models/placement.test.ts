import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { partsOf, hardwareOf, type Part } from '../core/parts';
import { assemblyOf, poseAt } from '../core/assembly';
import { buildBom } from '../core/bom';
import { resolveFile } from '../core/catalog';
import { COLOR_SLOTS } from '../core/types';
import type { UnitSpec } from '../core/types';
import { DEPTHS, heightsFor } from '../core/dims';
import { decodeMesh } from './mesh-codec';
import { placePartGeometry, shaftCenter } from './placement';
import manifest from '../../public/demo-models/manifest.json';

const spec = (width: 'S' | 'L' = 'S', height: 1 | 2 | 4 = 1): UnitSpec => ({ type: 'sustainer', width, depth: 5, height, interior: 'flat' });
const part = (id: string, height: 1 | 2 = 1) => partsOf(spec('S', height)).find((p) => p.id === id)!;
const geometries = new Map<string, THREE.BufferGeometry>();
const palette = Object.fromEntries(COLOR_SLOTS.map((slot) => [slot, '10100'])) as Record<(typeof COLOR_SLOTS)[number], string>;
function geometry(p: Part) {
  const path = resolveFile(p.files[0].path)!.p;
  if (geometries.has(path)) return geometries.get(path)!;
  const entry = manifest.files[path as keyof typeof manifest.files];
  const bytes = gunzipSync(readFileSync(new URL(`../../public/demo-models/${entry.file}`, import.meta.url)));
  const m = decodeMesh(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.positions), 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.rotateZ(m.angleZ); g.computeBoundingBox();
  geometries.set(path, g);
  return g;
}

function localPoint(g: THREE.BufferGeometry, relative: [number, number, number], m: THREE.Matrix4) {
  return g.boundingBox!.min.clone().add(new THREE.Vector3(...relative)).applyMatrix4(m);
}

// 体验模型网格不随 Git 仓库发布（来自付费模型包，见 docs/preview-models.md）；本地没有时跳过，用 npm run demo-models 生成
const hasModels = Object.values(manifest.files).every((e) => existsSync(new URL(`../../public/demo-models/${e.file}`, import.meta.url)));
describe.skipIf(!hasModels)('收纳箱真实网格装配回归', () => {
  it.each([1, 2] as const)('%iF 上下铰链和两根连杆同轴，安装面贴合后壁与箱盖', (height) => {
    const bottom = part('hinges', height), top = part('hinge-tops', height), roof = part('roof', height);
    const moduleH = height === 1 ? 50.8 : 84.8;
    const placedBottom = placePartGeometry(bottom, geometry(bottom));
    expect(placedBottom).toHaveLength(2);
    for (const [i, { g, m }] of placedBottom.entries()) {
      // 第二片在原始摆盘中反面朝上，局部 Y 孔位也需镜像。
      const depth = g.boundingBox!.getSize(new THREE.Vector3()).y;
      const localY = (y: number) => i === 1 ? depth - y : y;
      const c = localPoint(g, [height === 1 ? 40.8 : 60, localY(7), 20], m);
      expect(c.y).toBeCloseTo(moduleH, 1);
      expect(c.z).toBeCloseTo(-7.6, 1);
      // 支架背面接触模组后壁的 6.9mm 安装台。
      expect(localPoint(g, [0, localY(21.5), 0], m).z).toBeCloseTo(6.9, 1);
    }
    const [{ g, m }] = placePartGeometry(top, geometry(top));
    const c = localPoint(g, [7, 7, 31.4], m);
    expect(c.y).toBeCloseTo(moduleH, 1);
    expect(c.z).toBeCloseTo(-7.6, 1);
    const [{ g: rg, m: rm }] = placePartGeometry(roof, geometry(roof));
    expect(localPoint(rg, [14.6, 0, 0], rm).y).toBeCloseTo(moduleH, 1);
    for (const { g: rod, m: transform } of placePartGeometry(part('rods', height), geometry(part('rods', height)))) {
      const size = rod.boundingBox!.getSize(new THREE.Vector3());
      // 连杆的头部沿 Y 达 18mm，12.65mm 是 Z 厚度。
      expect(size.z).toBeCloseTo(12.65, 1);
      expect(size.y).toBeCloseTo(18, 1);
      expect(size.x).toBeGreaterThan(74.9);
      const axis = new THREE.Vector3(...shaftCenter(rod)).applyMatrix4(transform);
      expect(axis.y).toBeCloseTo(moduleH, 1);
      expect(axis.z).toBeCloseTo(-7.6, 1);
    }
  });

  it('锁外件已绕正面法线旋转 180°：转轴端在上，自由端在下', () => {
    const p = part('locks');
    const [{ g, m }] = placePartGeometry(p, geometry(p));
    const axis = localPoint(g, [6, 12.2, 25], m);
    const hook = localPoint(g, [49.3, 0, 25], m);
    expect(axis.y).toBeGreaterThan(hook.y + 40);
    expect(axis.z).toBeGreaterThan(hook.z);
    expect(new THREE.Vector3(0, 1, 0).transformDirection(m).z).toBeCloseTo(1);
  });

  it.each(['S', 'M', 'L', 'XL'] as const)('%s 锁支架螺丝对准真实孔心，头底面贴安装板而非转轴凸耳', (width) => {
    // LOCK HOLDER 的四个孔：局部 X 距边 6.56/15.56，Z 距边 6.56/67.96。
    // 安装板外表面是局部 Y=5.6；Y=20.1 是凸耳端面，不能用于螺丝就位。
    const holderGeometry = geometry(part('lock-holders'));
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    for (const depth of DEPTHS) for (const height of heightsFor(width)) {
      const parts = partsOf({ type: 'sustainer', width, depth, height, interior: 'flat' });
      const holders = parts.find((p) => p.id === 'lock-holders')!;
      const bolts = parts.find((p) => p.id === 'lock-bolts')!;
      const seats = placePartGeometry(holders, holderGeometry).flatMap(({ g, m }) => {
        const mesh = new THREE.Mesh(g, material);
        mesh.applyMatrix4(m); mesh.updateMatrixWorld(true);
        return [6.56, 15.56].flatMap((x) => [6.56, 67.96].map((z) => ({
          center: localPoint(g, [x, 5.6, z], m), mesh,
        })));
      });
      expect(bolts.blocks.length / 2).toBe(seats.length);
      for (let i = 0; i < bolts.blocks.length; i += 2) {
        const head = bolts.blocks[i], shaft = bolts.blocks[i + 1];
        const center = new THREE.Vector3(head.at[0] + head.size[0] / 2, head.at[1] + head.size[1] / 2, head.at[2]);
        const seat = seats.reduce((a, b) => a.center.distanceTo(center) < b.center.distanceTo(center) ? a : b);
        expect(center.distanceTo(seat.center)).toBeLessThan(0.03);
        // 用头部边缘的射线检查真实安装面，独立于代理包围盒的最前端。
        const ray = new THREE.Raycaster(center.clone().add(new THREE.Vector3(2.7, 0, 1)), new THREE.Vector3(0, 0, -1));
        const hit = ray.intersectObject(seat.mesh)[0];
        expect(hit).toBeDefined();
        expect(hit.point.z).toBeCloseTo(head.at[2], 1);
        expect(shaft.at[2] + shaft.size[2]).toBeCloseTo(head.at[2], 5);
      }
    }
    material.dispose();
  });

  it('一套销钉拆成四根，两把锁复用整套，不能重复显示整个四件文件', () => {
    const p = part('lock-pins');
    for (const s of [spec(), spec('L')]) {
      const pins = partsOf(s).find((x) => x.id === 'lock-pins')!;
      const placed = placePartGeometry(pins, geometry(p));
      expect(placed).toHaveLength(s.width === 'S' ? 4 : 8);
      for (const { g } of placed) {
        const size = g.boundingBox!.getSize(new THREE.Vector3());
        expect(size.x).toBeGreaterThan(17);
        expect(size.x).toBeLessThan(22);
        // 拆分后的 XY 外包围盒包含头部与简化余量；厚度由 Z 检查。
        expect(size.y).toBeLessThan(6);
        expect(size.z).toBeLessThan(5.4);
      }
    }
  });

  it('S/M 一体上铰链和 L/XL 四片铰链分别计数，成套文件只打印一次', () => {
    for (const [width, total] of [['S', 16], ['L', 24]] as const) {
      const { rows } = buildBom([{ id: 'test', spec: spec(width), pos: [0, 0, 0] }], palette);
      expect(rows).toHaveLength(11);
      expect(rows.reduce((sum, r) => sum + r.qty * r.piecesPerFile, 0)).toBe(total);
      expect(rows.find((r) => r.path.includes('Rods'))?.qty).toBe(1);
      expect(rows.find((r) => r.path.includes('Hinge Top'))?.piecesPerFile).toBe(width === 'S' ? 1 : 2);
    }
    expect(hardwareOf(spec())).toEqual({ 'M4×14mm 螺栓': 8, 'M4×10mm 螺栓': 8, 'M4×20mm 螺栓': 4 });
  });

  it('上铰链随盖移动，连杆在对接时出现，最后所有新增零件都归位', () => {
    const s = spec(); const steps = assemblyOf(s);
    expect(poseAt(steps, 1, 1, 'hinge-tops').visible).toBe(false);
    expect(poseAt(steps, 2, 1, 'hinge-tops').offset).toEqual(poseAt(steps, 2, 1, 'roof').offset);
    expect(poseAt(steps, 3, 1, 'rods').visible).toBe(false);
    expect(poseAt(steps, 4, 1, 'rods')).toMatchObject({ visible: true, offset: [0, 0, 0] });
    for (const p of partsOf(s)) expect(poseAt(steps, steps.length - 1, 1, p.id)).toMatchObject({ visible: true, offset: [0, 0, 0] });
  });
});
