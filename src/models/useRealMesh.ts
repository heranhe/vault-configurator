import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useStore } from '../store';
import { loadMesh, type MeshData } from './loader';

const geoCache = new WeakMap<MeshData, THREE.BufferGeometry>();

function toGeometry(m: MeshData) {
  let g = geoCache.get(m);
  if (!g) {
    const src = new THREE.BufferGeometry();
    // 复制一份：rotateZ 会原地修改数组，而同一份数据还要写入缓存
    src.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.positions), 3));
    src.setIndex(new THREE.BufferAttribute(m.indices, 1));
    // Worker 求的是「转 +angleZ 后包围盒最小」，所以这里按同方向转
    if (m.angleZ) src.rotateZ(m.angleZ);
    // 折角法线：30° 以内平滑、以上保持锐边，看起来更像真实打印件
    g = toCreasedNormals(src, THREE.MathUtils.degToRad(30));
    src.dispose();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    geoCache.set(m, g);
  }
  return g;
}

/** 返回零件的真实几何（已简化）；没连接模型、找不到文件或还在加载时返回 null */
export function useRealMesh(path: string | undefined, enabled: boolean, allowDemo = false) {
  const source = useStore((s) => s.source);
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    setGeo(null);
    if (!enabled || !path) return;
    const p = loadMesh(source, path, true, allowDemo);
    if (!p) return;
    let alive = true;
    p.then((m) => alive && setGeo(m ? toGeometry(m) : null)).catch((e) => console.warn('模型加载失败', path, e));
    return () => {
      alive = false;
    };
  }, [source, path, enabled, allowDemo]);
  return geo;
}
