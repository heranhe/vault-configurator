import { CameraControls, Environment, Grid, Lightformer } from '@react-three/drei';
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { boxOf } from '../core/rules';
import { useStore } from '../store';
import { controls } from './controls';
import { DragController } from './DragController';
import { UnitView } from './UnitView';

const deg = THREE.MathUtils.degToRad;
const STUDIO_BG = '#ece6d8'; // 与页面底色一致，场景和页面融为一体
/** 画面四周被浮动面板挡住的宽度（px），取景时避开。由 .stage-overlay（面板之间的空白区）实时量出 */
const VIEW_INSETS = { left: 0, right: 0, top: 0, bottom: 0 };
function measureInsets(canvas: HTMLElement) {
  const free = document.querySelector('.stage-overlay')?.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  if (!free || !c.width) return;
  // 上下再各留出提示条和读数条的高度
  VIEW_INSETS.left = Math.max(0, free.left - c.left);
  VIEW_INSETS.right = Math.max(0, c.right - free.right);
  VIEW_INSETS.top = Math.max(0, free.top - c.top + 44);
  VIEW_INSETS.bottom = Math.max(0, c.bottom - free.bottom + 44);
}
/** 当前画布尺寸（px），由 CameraRig 更新，fitBox 用来换算可用区域 */
const viewport = { w: 1, h: 1 };
/** 预设视角（方位角, 极角）。默认「产品图」参考官网主图：左前 3/4、略微俯视 */
export const VIEW_PRESETS: Record<string, [number, number]> = {
  产品图: [deg(-32), deg(76)],
  正面: [0, deg(80)],
  正视: [0, deg(90)],
  斜视: [deg(32), deg(64)],
  左侧: [deg(-90), deg(78)],
  右侧: [deg(90), deg(78)],
  顶视: [0, deg(1)],
};

function unitsBox(ids?: string[]) {
  const { placements } = useStore.getState();
  const targets = ids ? placements.filter((p) => ids.includes(p.id)) : placements;
  const box = new THREE.Box3();
  if (!targets.length) return box.set(new THREE.Vector3(-170, 0, -120), new THREE.Vector3(170, 160, 120));
  for (const p of targets) {
    const b = boxOf(p);
    box.union(new THREE.Box3(new THREE.Vector3(b.x, b.y, b.z), new THREE.Vector3(b.x + b.w, b.y + b.h, b.z + b.d)));
  }
  return box;
}

/**
 * 让包围盒尽量占满画面：在指定角度下，求出所有角点都落在视锥内的最小距离。
 * （camera-controls 的 fitToBox 会把视角吸到轴向，fitToSphere 又留白太多）
 */
export function fitBox(box: THREE.Box3, az: number, polar: number, smooth = true, margin = 1.08) {
  const cc = controls.current;
  if (!cc) return;
  const cam = cc.camera as THREE.PerspectiveCamera;
  const center = box.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));
  const forward = dir.clone().negate();
  const worldUp = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);
  // 只用面板之间露出来的那块区域取景
  const { w: W, h: H } = viewport;
  const fx = Math.max(0.3, (W - VIEW_INSETS.left - VIEW_INSETS.right) / W);
  const fy = Math.max(0.3, (H - VIEW_INSETS.top - VIEW_INSETS.bottom) / H);
  const tanV = Math.tan(deg(cam.fov / 2)) * fy;
  const tanH = Math.tan(deg(cam.fov / 2)) * cam.aspect * fx;
  let d = 0;
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
    const z = c.dot(dir);
    d = Math.max(d, z + Math.abs(c.dot(right)) / tanH, z + Math.abs(c.dot(up)) / tanV);
  }
  d *= margin;
  const pos = center.clone().addScaledVector(dir, d);
  void cc.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, smooth);
}

/** 相机：默认正面并让产品占满画面；增删单元、点「适配」或进入爆炸查看时重新取景 */
function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const explodeId = useStore((s) => s.explodeId);
  const fitNonce = useStore((s) => s.fitNonce);
  const count = useStore((s) => s.placements.length);
  const { size } = useThree();

  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const [layoutNonce, setLayoutNonce] = useState(0);

  // 面板尺寸变化（比如收起底部清单）时重新量取空白区并取景
  useEffect(() => {
    const el = document.querySelector('.stage-overlay');
    if (!el) return;
    const ro = new ResizeObserver(() => setLayoutNonce((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    controls.current = ref.current;
  }, []);

  // 把画面中心挪到两侧面板之间，产品不会被面板挡住
  useEffect(() => {
    measureInsets(gl.domElement);
    const { left, right, top, bottom } = VIEW_INSETS;
    viewport.w = size.width;
    viewport.h = size.height;
    camera.setViewOffset(size.width, size.height, (right - left) / 2, (bottom - top) / 2, size.width, size.height);
    camera.updateProjectionMatrix();
  }, [camera, gl, size.width, size.height, layoutNonce]);

  useEffect(() => {
    if (!ref.current) return;
    if (explodeId) {
      const box = unitsBox([explodeId]);
      box.max.z += 260; // 爆炸后零件主要向前（+Z）展开
      box.max.y += 60;
      box.min.y -= 60;
      fitBox(box, ...VIEW_PRESETS['斜视']);
    } else {
      const { viewAngle } = useStore.getState();
      fitBox(unitsBox(), ...(viewAngle ?? VIEW_PRESETS['产品图']));
    }
  }, [explodeId, fitNonce, count, size.width, size.height, layoutNonce]);

  return <CameraControls ref={ref} makeDefault minDistance={120} maxDistance={8000} maxPolarAngle={Math.PI / 2 - 0.02} dollyToCursor smoothTime={0.25} />;
}

/** 开发辅助：暴露相机和渲染器，用于标定零件朝向和生成缩略图 */
function DevHooks() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const shot = async (name: string, dir = 'shots') => {
      // 等后期处理（AO、色调映射）合成完一帧再取图；开发模式下保留了绘制缓冲
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const data = gl.domElement.toDataURL('image/png');
      return (await fetch(`/api/save?dir=${dir}&name=${encodeURIComponent(name)}`, { method: 'POST', body: data })).json();
    };
    Object.assign(window, { __vault: { controls, store: useStore, gl, scene, camera, shot, fitBox, unitsBox } });
  }, [gl, scene, camera]);
  return null;
}

function useBounds() {
  const placements = useStore((s) => s.placements);
  return useMemo(() => {
    let x0 = -170, x1 = 170, z0 = -120, z1 = 120, h = 0;
    for (const p of placements) {
      const b = boxOf(p);
      x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w);
      z0 = Math.min(z0, b.z); z1 = Math.max(z1, b.z + b.d);
      h = Math.max(h, b.y + b.h);
    }
    return { x0, x1, z0, z1, h };
  }, [placements]);
}

/** 拖动时才出现的定位网格（42 mm Gridfinity 格），平时隐藏 */
function DragGrid() {
  const b = useBounds();
  const dragging = useStore((s) => !!s.drag);
  if (!dragging) return null;
  const snap = (v: number) => Math.ceil(v / 42) * 42;
  const w = snap(b.x1 - b.x0 + 1200), d = snap(b.z1 - b.z0 + 900);
  return (
    <group position={[(b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2]}>
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color="#cfe3d6" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <Grid position={[0, 0.2, 0]} args={[w, d]} cellSize={42} cellThickness={0.7} cellColor="#8fb8a0" sectionSize={210} sectionThickness={1.1} sectionColor="#6f9f84" fadeDistance={1e5} />
    </group>
  );
}

/** 影棚灯光：参考官网渲染图。柔光箱环境反射 + 左前方主光投影 + 环境光遮蔽，避免发白、发平 */
function Studio() {
  // 生成缩略图时不画投影：长投影会被当成产品的一部分裁进去，产品就显得很小
  const capture = useStore((s) => s.capture);
  return (
    <>
      <color attach="background" args={[STUDIO_BG]} />
      <Environment resolution={256} background={false}>
        <Lightformer form="rect" intensity={0.9} color="#ffffff" position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[10, 6, 1]} />
        <Lightformer form="rect" intensity={0.55} color="#ffffff" position={[-6, 2, 3]} rotation-y={Math.PI / 3} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={0.3} color="#fff1df" position={[6, 2, 1]} rotation-y={-Math.PI / 3} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={0.7} color="#e6edf8" position={[0, 2, -6]} scale={[10, 4, 1]} />
      </Environment>
      {/* 主光：左前上方，制造明暗面和投影 */}
      <directionalLight
        position={[-700, 1200, 900]}
        intensity={2.6}
        color="#fff8ee"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-1500}
        shadow-camera-right={1500}
        shadow-camera-top={1500}
        shadow-camera-bottom={-1500}
        shadow-camera-far={5000}
        shadow-bias={-0.0002}
        shadow-normalBias={0.8}
      />
      {/* 补光：右侧弱冷光 */}
      <directionalLight position={[900, 400, 400]} intensity={0.35} color="#dfe8ff" />
      {/* 只接收阴影的地面，看不见地面本身 */}
      {!capture && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]} receiveShadow>
          <planeGeometry args={[20000, 20000]} />
          <shadowMaterial opacity={0.28} />
        </mesh>
      )}
      <EffectComposer multisampling={4} enableNormalPass={false}>
        <N8AO aoRadius={22} distanceFalloff={0.6} intensity={2.4} quality="medium" halfRes />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </>
  );
}

export function Scene() {
  const placements = useStore((s) => s.placements);
  // 某些嵌入环境里 ResizeObserver 首次不触发，画布会一直空白；主动补一次 resize
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
    return () => clearTimeout(t);
  }, []);
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      gl={{ antialias: false, preserveDrawingBuffer: import.meta.env.DEV }}
      camera={{ position: [0, 300, 1200], fov: 30, near: 5, far: 30000 }}
      onPointerMissed={(e) => {
        if (e.button === 0 && !useStore.getState().explodeId) useStore.getState().select(null);
      }}
    >
      <Studio />
      <DragGrid />
      {placements.map((p) => (
        <UnitView key={p.id} p={p} />
      ))}
      <DragController />
      <CameraRig />
      {import.meta.env.DEV && <DevHooks />}
    </Canvas>
  );
}
