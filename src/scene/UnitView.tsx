import { Edges, Html, RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colorOf } from '../core/bom';
import { dimsOf } from '../core/dims';
import { partsOf, type Block, type Part } from '../core/parts';
import { columnOf } from '../core/rules';
import type { Placement, Vec3 } from '../core/types';
import { fitToBlock } from '../models/orient';
import { useRealMesh } from '../models/useRealMesh';
import { colorById } from '../data/colors';
import { useStore } from '../store';
import { controls } from './controls';

const DRAG_THRESHOLD = 5;


function BlockMesh({ b, color, opacity }: { b: Block; color: string; opacity: number }) {
  const pos: [number, number, number] = [b.at[0] + b.size[0] / 2, b.at[1] + b.size[1] / 2, b.at[2] + b.size[2] / 2];
  const transparent = opacity < 1;
  // transparent 切换需要重新编译着色器，用 key 强制重建材质
  const mat = (
    <meshPhysicalMaterial key={transparent ? 't' : 'o'} color={color} roughness={0.52} clearcoat={0.12} clearcoatRoughness={0.6} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
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
  const matrices = useMemo(
    () => (geo ? targets.map((b) => fitToBlock(geo.boundingBox!, b, part.orient)) : []),
    [geo, targets, part],
  );
  if (!geo) return <>{part.blocks.map((b, i) => <BlockMesh key={i} b={b} color={color} opacity={opacity} />)}</>;
  const transparent = opacity < 1;
  return (
    <>
      {matrices.map((m, i) => (
        <mesh key={i} geometry={geo} matrix={m} matrixAutoUpdate={false} castShadow={!transparent} receiveShadow>
          <meshPhysicalMaterial key={transparent ? 't' : 'o'} color={color} roughness={0.52} clearcoat={0.12} clearcoatRoughness={0.6} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
        </mesh>
      ))}
    </>
  );
}

function PartView({ part, color, opacity, exploding, showLabel }: { part: Part; color: string; opacity: number; exploding: boolean; showLabel: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const t = exploding ? useStore.getState().explodeT : 0;
    target.set(part.explode[0] * t, part.explode[1] * t, part.explode[2] * t);
    const p = ref.current.position;
    p.x = THREE.MathUtils.damp(p.x, target.x, 10, dt);
    p.y = THREE.MathUtils.damp(p.y, target.y, 10, dt);
    p.z = THREE.MathUtils.damp(p.z, target.z, 10, dt);
  });
  const center = useMemo(() => {
    const b = part.blocks[0];
    return [b.at[0] + b.size[0] / 2, b.at[1] + b.size[1] + 8, b.at[2] + b.size[2] / 2] as [number, number, number];
  }, [part]);
  return (
    <group ref={ref}>
      <RealOrProxy part={part} color={color} opacity={opacity} />
      {showLabel && (
        <Html position={center} center className="part-label" zIndexRange={[20, 0]}>
          {part.name}
        </Html>
      )}
    </group>
  );
}

export function UnitView({ p }: { p: Placement }) {
  const palette = useStore((s) => s.palette);
  const selected = useStore((s) => s.selectedId === p.id);
  const explodeId = useStore((s) => s.explodeId);
  const explodeT = useStore((s) => s.explodeT);
  const xray = useStore((s) => s.xray);
  const dragging = useStore((s) => !!s.drag?.groupIds.includes(p.id));
  const parts = useMemo(() => partsOf(p.spec), [p.spec]);
  const { w, h, d } = dimsOf(p.spec);

  const exploding = explodeId === p.id;
  const ghost = (!!explodeId && !exploding) || dragging;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const st = useStore.getState();
    if (st.explodeId && st.explodeId !== p.id) return;
    e.stopPropagation();
    if (st.explodeId) return; // 爆炸查看中不能拖动
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
            color={colorById(part.fixedColor ?? colorOf(p, part.slot, palette)).hex}
            opacity={opacity}
            exploding={exploding}
            showLabel={exploding && explodeT > 0.15}
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
