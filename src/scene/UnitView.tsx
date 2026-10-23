import { Edges, RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { assemblyOf, poseAt, type AsmStep } from '../core/assembly';
import { colorOf } from '../core/bom';
import { dimsOf } from '../core/dims';
import { partsOf, type Block, type Part } from '../core/parts';
import { columnOf } from '../core/rules';
import type { Placement, Vec3 } from '../core/types';
import { placePartGeometry } from '../models/placement';
import { isDemoSpec } from '../models/demo';
import { useRealMesh } from '../models/useRealMesh';
import { colorById } from '../data/colors';
import { useStore } from '../store';
import { callouts, EXPLODE_GAIN, screenAnchors } from './callouts';
import { instanceAssemblySteps, instanceExplodeOffset, instanceFocused, partInstances, visibleParts, type PartInstance } from './part-instances';
import { controls } from './controls';

const DRAG_THRESHOLD = 5;


/** 轴承与轴锁紧环保留通孔，避免被实心圆柱遮住轮轴。 */
function RingMesh({ position, axis, radius, length, bore, transparent, children }: { position: Vec3; axis: 'x' | 'y' | 'z'; radius: number; length: number; bore: number; transparent: boolean; children: ReactNode }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore / 2, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 32 }).translate(0, 0, -length / 2);
  }, [radius, length, bore]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const rotation: Vec3 = axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  return <mesh position={position} rotation={rotation} geometry={geometry} castShadow={!transparent} receiveShadow>{children}</mesh>;
}

function BlockMesh({ b, color, opacity }: { b: Block; color: string; opacity: number }) {
  const pos: [number, number, number] = [b.at[0] + b.size[0] / 2, b.at[1] + b.size[1] / 2, b.at[2] + b.size[2] / 2];
  const transparent = opacity < 1;
  // transparent 切换需要重新编译着色器，用 key 强制重建材质
  const mat = (
    <meshPhysicalMaterial key={transparent ? 't' : 'o'} color={color} roughness={0.52} clearcoat={0.12} clearcoatRoughness={0.6} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
  );
  if (b.cyl) {
    if (b.cylVector) {
      const direction = new THREE.Vector3(...b.cylVector);
      const length = direction.length();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      return <mesh position={pos} quaternion={quaternion} castShadow={!transparent} receiveShadow>
        <cylinderGeometry args={[b.cylRadius!, b.cylRadius!, length, 32]} />{mat}
      </mesh>;
    }
    const axis = b.cylAxis ?? 'z';
    const radius = (axis === 'x' ? b.size[1] : b.size[0]) / 2;
    const length = b.size[axis === 'x' ? 0 : axis === 'y' ? 1 : 2];
    if (b.bore) return <RingMesh position={pos} axis={axis} radius={radius} length={length} bore={b.bore} transparent={transparent}>{mat}</RingMesh>;
    const rotation: Vec3 = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'y' ? [0, 0, 0] : [Math.PI / 2, 0, 0];
    return <mesh position={pos} rotation={rotation} castShadow={!transparent} receiveShadow>
      <cylinderGeometry args={[radius, radius, length, 32]} />{mat}
    </mesh>;
  }
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

const HIGHLIGHT = new THREE.Color('#ff8a1f');
const NO_GLOW = new THREE.Color('#000000');

/** 一个实物一个 group：独立动画、独立锚点、独立点选与高亮。 */
function InstanceView({ instance, part, unitId, steps, exploding, children }: { instance: PartInstance; part: Part; unitId: string; steps: AsmStep[]; exploding: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const entrySteps = useMemo(() => instanceAssemblySteps(steps, part.id, instance.slide), [steps, part.id, instance.slide]);

  useEffect(() => {
    if (!exploding || !ref.current) return;
    const key = `${unitId}/${instance.id}`;
    callouts.set(key, { unitId, partId: part.id, pieceId: instance.id, name: instance.name, group: ref.current, anchor: new THREE.Vector3(...instance.anchor) });
    return () => { callouts.delete(key); screenAnchors.delete(key); };
  }, [exploding, unitId, part.id, instance]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const st = useStore.getState();
    const asm = exploding && st.assembly?.unitId === unitId ? st.assembly : null;
    let active = false;
    if (asm) {
      const pose = poseAt(entrySteps, Math.min(asm.step, entrySteps.length - 1), Math.min(asm.t, 1), part.id);
      g.position.set(...pose.offset);
      g.visible = pose.visible;
      active = pose.active && asm.t < 1.6;
    } else {
      g.visible = true;
      const offset = instanceExplodeOffset(instance, exploding ? st.explodeT : 0, EXPLODE_GAIN);
      g.position.x = THREE.MathUtils.damp(g.position.x, offset[0], 10, dt);
      g.position.y = THREE.MathUtils.damp(g.position.y, offset[1], 10, dt);
      g.position.z = THREE.MathUtils.damp(g.position.z, offset[2], 10, dt);
    }
    const hl = exploding && (st.focusPart ? instanceFocused(st.focusPart, instance) : active);
    // 网格异步加载后也必须立即继承当前单件高亮状态。
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
      const intensity = hl ? 0.45 : 0;
      if (m?.emissive && m.emissiveIntensity !== intensity) {
        m.emissive.copy(hl ? HIGHLIGHT : NO_GLOW);
        m.emissiveIntensity = intensity;
      }
    });
  });
  return <group ref={ref} userData={{ partId: instance.id, parentPartId: part.id }}>{children}</group>;
}

/** 文件加载与拆网格仍复用整套 STL；显示层按独立实物创建 group。 */
function PartView({ part, unitId, steps, color, opacity, exploding, demo }: { demo: boolean; part: Part; unitId: string; steps: AsmStep[]; color: string; opacity: number; exploding: boolean }) {
  const geo = useRealMesh(part.files[0]?.path, part.real !== 'none', demo);
  const placed = useMemo(() => geo ? placePartGeometry(part, geo) : [], [geo, part]);
  const instances = useMemo(() => partInstances(part), [part]);
  const transparent = opacity < 1;
  return <>{instances.map((instance) => (
    <InstanceView key={instance.id} instance={instance} part={part} unitId={unitId} steps={steps} exploding={exploding}>
      {geo ? (part.real === 'each' ? instance.blockIndices.map((i) => placed[i]) : placed).map(({ g, m }, i) => (
        <mesh key={i} geometry={g} matrix={m} matrixAutoUpdate={false} castShadow={!transparent} receiveShadow>
          <meshPhysicalMaterial key={transparent ? 't' : 'o'} color={color} roughness={0.52} clearcoat={0.12} clearcoatRoughness={0.6} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
        </mesh>
      )) : instance.blocks.map((b, i) => <BlockMesh key={i} b={b} color={color} opacity={opacity} />)}
    </InstanceView>
  ))}</>;
}

export function UnitView({ p }: { p: Placement }) {
  const palette = useStore((s) => s.palette);
  const selected = useStore((s) => s.selectedId === p.id);
  const explodeId = useStore((s) => s.explodeId);
  const xray = useStore((s) => s.xray);
  const dragging = useStore((s) => !!s.drag?.groupIds.includes(p.id));
  const parts = useMemo(() => visibleParts(partsOf(p.spec)), [p.spec]);
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
            demo={isDemoSpec(p.spec)}
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
