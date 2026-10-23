import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { controls } from '../scene/controls';
import { VIEW_PRESETS } from '../scene/Scene';
import { useStore } from '../store';

const toDeg = THREE.MathUtils.radToDeg;
const toRad = THREE.MathUtils.degToRad;

/** 右侧视角面板：预设视角 + 可拖动的方位 / 俯仰 / 远近，和 3D 场景实时同步 */
export function ViewPanel() {
  const [az, setAz] = useState(0);
  const [elev, setElev] = useState(18);
  const [dist, setDist] = useState(1000);

  // 相机被鼠标转动时，同步滑块
  useEffect(() => {
    let raf = 0;
    let off: (() => void) | undefined;
    const bind = () => {
      const cc = controls.current;
      if (!cc) {
        raf = requestAnimationFrame(bind);
        return;
      }
      const sync = () => {
        setAz(Math.round(toDeg(cc.azimuthAngle)));
        setElev(Math.round(90 - toDeg(cc.polarAngle)));
        setDist(Math.round(cc.distance));
      };
      sync();
      cc.addEventListener('update', sync);
      off = () => cc.removeEventListener('update', sync);
    };
    bind();
    return () => {
      cancelAnimationFrame(raf);
      off?.();
    };
  }, []);

  const preset = (name: string) => {
    useStore.setState({ viewAngle: VIEW_PRESETS[name] });
    useStore.getState().fitView();
  };

  return (
    <section>
      <div className="fig">FIG. 04 · 视角</div>
      <div className="view-presets">
        {Object.keys(VIEW_PRESETS).map((k) => (
          <button key={k} className="pill" onClick={() => preset(k)}>{k}</button>
        ))}
        <button className="pill pill-dark" onClick={() => useStore.getState().fitView()}>占满画面</button>
      </div>
      <label className="slider-row">
        <span>方位</span>
        <input type="range" min={-180} max={180} value={az} onChange={(e) => void controls.current?.rotateAzimuthTo(toRad(+e.target.value), true)} />
        <span className="val">{az}°</span>
      </label>
      <label className="slider-row">
        <span>俯仰</span>
        <input type="range" min={1} max={89} value={elev} onChange={(e) => void controls.current?.rotatePolarTo(toRad(90 - +e.target.value), true)} />
        <span className="val">{elev}°</span>
      </label>
      <label className="slider-row">
        <span>远近</span>
        <input type="range" min={150} max={4000} step={10} value={dist} onChange={(e) => void controls.current?.dollyTo(+e.target.value, true)} />
        <span className="val">{(dist / 1000).toFixed(1)}m</span>
      </label>
    </section>
  );
}
