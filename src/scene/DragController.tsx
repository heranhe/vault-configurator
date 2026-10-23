import { Edges, Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { dimsOf, specName } from '../core/dims';
import { boxOf, dropOnGround, dropOnUnit, intersects } from '../core/rules';
import { useStore } from '../store';

/** 拖动时与指针射线求交的水平面，高度取抓取点高度（从零件库拖入时为地面） */
const grabPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const TOP_ZONE = 18; // mm，命中点距顶面在此范围内才视为要叠放

function unitIdOf(obj: THREE.Object3D | null): { id: string; ghost: boolean } | null {
  for (let o = obj; o; o = o.parent) if (o.userData?.unitId) return { id: o.userData.unitId, ghost: !!o.userData.ghost };
  return null;
}

/** 拖动中：把指针射线换算成落点（吸附 / 校验），松手时提交 */
export function DragController() {
  const { camera, gl, scene } = useThree();
  const active = useStore((s) => !!s.drag);

  useEffect(() => {
    if (!active) return;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitPoint = new THREE.Vector3();

    const move = (ev: PointerEvent) => {
      const st = useStore.getState();
      const drag = st.drag;
      if (!drag) return;
      const rect = gl.domElement.getBoundingClientRect();
      // 画布铺满整块区域、被面板盖住一部分：指针在面板上时不算放进场景
      const inside = document.elementFromPoint(ev.clientX, ev.clientY) === gl.domElement;
      if (!inside) return st.setDrop(null);
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);

      const others = st.placements.filter((p) => !drag.groupIds.includes(p.id));
      const hit = raycaster
        .intersectObjects(scene.children, true)
        .map((h) => ({ h, u: unitIdOf(h.object) }))
        .find(({ u }) => u && !u.ghost && !drag.groupIds.includes(u.id));
      // 只有指向顶面附近才算「叠放」；指向侧面时按地面处理，便于贴靠并排
      if (hit?.u) {
        const t = others.find((p) => p.id === hit.u!.id)!;
        if (hit.h.point.y < t.pos[1] + dimsOf(t.spec).h - TOP_ZONE) hit.u = null;
      }

      // 拖已有单元时保持抓取点偏移：落点中心 = 指针 − 抓取偏移 + 半尺寸
      const { w, d } = dimsOf(drag.spec);
      const offX = drag.grab ? w / 2 - drag.grab.dx : 0;
      const offZ = drag.grab ? d / 2 - drag.grab.dz : 0;
      grabPlane.constant = -(drag.grab?.y ?? 0);

      let drop;
      if (hit?.u) {
        const target = others.find((p) => p.id === hit.u!.id)!;
        drop = dropOnUnit(drag.spec, target, hit.h.point.x + offX, others);
      } else if (raycaster.ray.intersectPlane(grabPlane, hitPoint)) {
        drop = dropOnGround(drag.spec, [hitPoint.x + offX, hitPoint.z + offZ], others);
      } else drop = null;

      // 拖动已有单元时，整列中其他单元也不能撞到东西
      if (drop?.ok && drag.baseId) {
        const base = st.placements.find((p) => p.id === drag.baseId)!;
        const delta = drop.pos.map((v, i) => v - base.pos[i]);
        for (const gid of drag.groupIds) {
          if (gid === drag.baseId) continue;
          const g = st.placements.find((p) => p.id === gid)!;
          const moved = boxOf({ ...g, pos: g.pos.map((v, i) => v + delta[i]) as [number, number, number] });
          if (others.some((o) => intersects(moved, boxOf(o)))) drop = { ...drop, ok: false, reason: '上方叠放的单元会与其他单元重叠' };
        }
      }
      st.setDrop(drop);
    };
    const up = () => useStore.getState().endDrag();
    const cancel = () => {
      useStore.getState().setDrop(null);
      useStore.getState().endDrag();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel); // 触屏被系统手势打断时不落下
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };
  }, [active, camera, gl, scene]);

  return <Ghost />;
}

/** 拖动预览：绿色 = 可以放，红色 = 不能放 */
function Ghost() {
  const drag = useStore((s) => s.drag);
  const placements = useStore((s) => s.placements);
  const items = useMemo(() => {
    if (!drag?.drop) return [];
    if (!drag.baseId) return [{ spec: drag.spec, pos: drag.drop.pos }];
    const base = placements.find((p) => p.id === drag.baseId)!;
    const delta = drag.drop.pos.map((v, i) => v - base.pos[i]);
    return drag.groupIds.map((id) => {
      const p = placements.find((x) => x.id === id)!;
      return { spec: p.spec, pos: p.pos.map((v, i) => v + delta[i]) as [number, number, number] };
    });
  }, [drag, placements]);

  if (!drag?.drop) return null;
  const ok = drag.drop.ok;
  const color = ok ? '#21a366' : '#e5484d';
  const first = dimsOf(items[0].spec);
  const tip = ok ? drag.drop.hint ?? specName(drag.spec) : drag.drop.reason;

  return (
    <group>
      {items.map((it, i) => {
        const { w, h, d } = dimsOf(it.spec);
        return (
          <mesh key={i} position={[it.pos[0] + w / 2, it.pos[1] + h / 2, it.pos[2] + d / 2]} raycast={() => null}>
            <boxGeometry args={[w, h, d]} />
            <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
            <Edges color={color} />
          </mesh>
        );
      })}
      <Html position={[items[0].pos[0] + first.w / 2, items[0].pos[1] + first.h + 20, items[0].pos[2] + first.d / 2]} center zIndexRange={[30, 0]}>
        <div className={`drop-tip ${ok ? 'ok' : 'bad'}`}>{ok ? '✓ ' : '✕ '}{tip}</div>
      </Html>
    </group>
  );
}
