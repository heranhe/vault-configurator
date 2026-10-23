import { Edges, RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { assemblyOf, poseAt, type AsmStep } from '../core/assembly';
import { colorOf } from '../core/bom';
import { dimsOf } from '../core/dims';
import { partsOf, type Block, type Part } from '../core/parts';
import { columnOf } from '../core/rules';
import type { Placement, Vec3 } from '../core/types';
import { fitToBlock } from '../models/orient';
import { splitPieces } from '../models/split';
import { useRealMesh } from '../models/useRealMesh';
import { colorById } from '../data/colors';
import { useStore } from '../store';
import { callouts, EXPLODE_GAIN, partAnchor } from './callouts';
import { controls } from './controls';

const DRAG_THRESHOLD = 5;


function BlockMesh({ b, color, opacity }: { b: Block; color: string; opacity: number }) {
  const pos: [number, number, number] = [b.at[0] + b.size[0] / 2, b.at[1] + b.size[1] / 2, b.at[2] + b.size[2] / 2];
  const transparent = opacity < 1;
  // transparent 切换需要重新编译着色器，用 key 强制重建材质
  const mat = (
    <meshPhysicalMaterial key={transparent ? 't' : 'o'} color={color} roughness={0.52} clearcoat={0.12} clearcoatRoughness={0.6} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
  );
  if (b.cyl)
    return (
      <mesh position={pos} rotation={[Math.PI / 2, 0, 0]} castShadow={!transparent} receiveShadow>
        <cylinderGeometry args={[b.size[0] / 2, b.size[0] / 2, b.size[2], 20]} />
        {mat}
      </mesh>
    );
  if (b.round && Math.min(...b.size) > 4)
    return (
      <RoundedBox args={b.size} radius={Math.min(2, Math.min(...b.size) / 3)} smoothness={2} position={pos} castShadow={!transparent} receiveShadow>
        {mat}
      </RoundedBox>
    );
  return (
    <mesh position={pos} castShadow={!transparent} receiveShadow>
      <boxGeometry args={b.size} />
      {mat}
    </mesh>
  );
}

function unionBlock(blocks: Block[]): Block {
  const min = [0, 1, 2].map((k) => Math.min(...blocks.map((b) => b.at[k])));
  const max = [0, 1, 2].map((k) => Math.max(...blocks.map((b) => b.at[k] + b.size[k])));
  return { at: min as Vec3, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** 有本地模型时显示真实零件（简化后），否则显示代理块 */
function RealOrProxy({ part, color, opacity }: { part: Part; color: string; opacity: number }) {
  const geo = useRealMesh(part.files[0]?.path, part.real !== 'none');
  const targets = useMemo(() => (part.real === 'each' ? part.blocks : [unionBlock(part.blocks)]), [part]);
  const placed = useMemo(() => {
    if (!geo) return [];
    // split：文件里本来就有 blocks.length 件，拆开后一件放一个位置，而不是整份文件每个位置各放一份
    const pieces = part.split ? splitPieces(geo, targets.length) : [geo];
    return targets.map((b, i) => {
      const g = pieces[i % pieces.length];
      const orient = b.flip ? { ...part.orient, post: b.flip } : part.orient;
      return { g, m: fitToBlock(g.boundingBox!, b, orient) };
    });
  }, [geo, targets, part]);
  if (!geo) return <>{part.blocks.map((b, i) => <BlockMesh key={i} b={b} color={color} opacity={opacity} />)}</>;
  const transparent = opacity < 1;
  return (
    <>
      {placed.map(({ g, m }, i) => (
        <mesh key={i} geometry={g} matrix={m} matrixAutoUpdate={false} castShadow={!transparent} receiveShadow>
          <meshPhysicalMaterial key={transparent ? 't' : 'o'} color={color} roughness={0.52} clearcoat={0.12} clearcoatRoughness={0.6} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
        </mesh>
      ))}
    </>
  );
}

const HIGHLIGHT = new THREE.Color('#ff8a1f');
const NO_GLOW = new THREE.Color('#000000');

function PartView({ part, unitId, steps, color, opacity, exploding }: { part: Part; unitId: string; steps: AsmStep[]; color: string; opacity: number; exploding: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const glow = useRef(false);

  // 爆炸 / 安装流程时登记给标注层，用来画引线
  useEffect(() => {
    if (!exploding || !ref.current) return;
    const key = `${unitId}/${part.id}`;
    callouts.set(key, { unitId, partId: part.id, name: part.name, group: ref.current, anchor: partAnchor(part) });
    return () => {
      callouts.delete(key);
    };
  }, [exploding, unitId, part]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const st = useStore.getState();
    const asm = exploding && st.assembly?.unitId === unitId ? st.assembly : null;
    let active = false;
    if (asm) {
      const pose = poseAt(steps, Math.min(asm.step, steps.length - 1), Math.min(asm.t, 1), part.id);
      g.position.set(...pose.offset);
      g.visible = pose.visible;
      active = pose.active && asm.t < 1.6;
    } else {
      g.visible = true;
      const t = exploding ? st.explodeT * EXPLODE_GAIN : 0;
      target.set(part.explode[0] * t, part.explode[1] * t, part.explode[2] * t);
      const p = g.position;
      p.x = THREE.MathUtils.damp(p.x, target.x, 10, dt);
      p.y = THREE.MathUtils.damp(p.y, target.y, 10, dt);
      p.z = THREE.MathUtils.damp(p.z, target.z, 10, dt);
    }
    // 高亮：点名的零件，或安装流程里这一步正在动的零件
    const hl = exploding && (st.focusPart === part.id || active);
    if (hl !== glow.current) {
      glow.current = hl;
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
        if (m?.emissive) {
          m.emissive.copy(hl ? HIGHLIGHT : NO_GLOW);
          m.emissiveIntensity = hl ? 0.45 : 0;
        }
      });
    }
  });
  return (
    <group ref={ref} userData={{ partId: part.id }}>
      <RealOrProxy part={part} color={color} opacity={opacity} />
    </group>
  );
}

export function UnitView({ p }: { p: Placement }) {
  const palette = useStore((s) => s.palette);
  const selected = useStore((s) => s.selectedId === p.id);
  const explodeId = useStore((s) => s.explodeId);
  const xray = useStore((s) => s.xray);
  const dragging = useStore((s) => !!s.drag?.groupIds.includes(p.id));
  const parts = useMemo(() => partsOf(p.spec), [p.spec]);
  const steps = useMemo(() => assemblyOf(p.spec), [p.spec]);
  const { w, h, d } = dimsOf(p.spec);

  const exploding = explodeId === p.id;
  const ghost = (!!explodeId && !exploding) || dragging;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const st = useStore.getState();
    if (st.explodeId && st.explodeId !== p.id) return;
    e.stopPropagation();
    if (st.explodeId) {
      // 爆炸查看中不能拖动；点零件 = 高亮它（再点一次取消）
      let o: THREE.Object3D | null = e.object;
      while (o && !o.userData.partId) o = o.parent;
      const id = o?.userData.partId as string | undefined;
      if (id) st.setFocusPart(st.focusPart === id ? null : id);
      return;
    }
    if (controls.current) controls.current.enabled = false;
    const sx = e.clientX, sy = e.clientY;
    const grab = { dx: e.point.x - p.pos[0], dz: e.point.z - p.pos[2], y: e.point.y };
    let started = false;
    const move = (ev: PointerEvent) => {
      if (started || Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) return;
      started = true;
      const col = columnOf(p.id, useStore.getState().placements);
      if (col.blocked) {
        useStore.getState().notify(col.blocked, 'error');
        return;
      }
      useStore.getState().startDrag({ spec: p.spec, baseId: p.id, groupIds: col.ids, grab });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (controls.current) controls.current.enabled = true;
      if (!started) useStore.getState().select(p.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <group
      position={p.pos}
      userData={{ unitId: p.id, ghost }}
      onPointerDown={ghost ? undefined : onPointerDown}
      onDoubleClick={(e) => {
        if (ghost) return;
        e.stopPropagation();
        useStore.getState().setExplode(p.id);
      }}
    >
      {parts.map((part) => {
        const shellLike = part.id === 'module' || part.id === 'roof';
        const opacity = ghost ? 0.07 : xray && shellLike && !exploding ? 0.18 : 1;
        return (
          <PartView
            key={part.id}
            part={part}
            unitId={p.id}
            steps={steps}
            color={colorById(part.fixedColor ?? colorOf(p, part.slot, palette)).hex}
            opacity={opacity}
            exploding={exploding}
          />
        );
      })}
      {selected && !explodeId && (
        <mesh position={[w / 2, h / 2, d / 2]} raycast={() => null}>
          <boxGeometry args={[w + 3, h + 3, d + 3]} />
          <meshBasicMaterial visible={false} />
          <Edges color="#2f6fd6" lineWidth={3} />
        </mesh>
      )}
    </group>
  );
}
