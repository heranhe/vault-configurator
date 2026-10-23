// 开发用：用本地真实模型批量渲染零件库缩略图（public/thumbs）和示例预览图（public/examples）。
// 在开发模式的页面控制台里运行：(await import('/src/dev/generate.ts')).generate()
// 渲染完再执行 python3 tools/trim-thumbs.py 裁边。
import { heightsFor, ROOF_TYPES, WIDTHS } from '../core/dims';
import type { Placement, UnitSpec } from '../core/types';
import { EXAMPLES } from '../data/examples';
import { onLoadProgress } from '../models/loader';
import { useStore } from '../store';

type Job = { dir: 'thumbs' | 'examples'; name: string; placements: Placement[]; view: [number, number] | null };

const FRONT: [number, number] = [0, Math.PI / 2];
const one = (spec: UnitSpec): Placement[] => [{ id: 'gen', spec, pos: [0, 0, 0] }];

export function jobs(only?: 'thumbs' | 'examples'): Job[] {
  const out: Job[] = [];
  if (only !== 'examples')
    for (const w of WIDTHS) {
      for (const h of heightsFor(w)) {
        out.push({ dir: 'thumbs', name: `drawer-${w}-${h}F`, placements: one({ type: 'drawer', width: w, depth: 5, height: h, interior: 'empty' }), view: FRONT });
        out.push({ dir: 'thumbs', name: `sustainer-${w}-${h}F`, placements: one({ type: 'sustainer', width: w, depth: 5, height: h, interior: 'flat' }), view: FRONT });
      }
      for (const r of ROOF_TYPES)
        if (r !== 'heavyweight' || w === 'L' || w === 'XL')
          out.push({ dir: 'thumbs', name: `roof-${w}-${r}`, placements: one({ type: 'roof', width: w, depth: 5, roof: r }), view: [0, Math.PI * 0.36] });
      for (const m of ['wheels', 'feet'] as const)
        out.push({ dir: 'thumbs', name: `base-${w}-${m}`, placements: one({ type: 'base', width: w, depth: 5, mode: m }), view: [-0.5, 1.25] });
    }
  if (only !== 'thumbs') for (const ex of EXAMPLES) out.push({ dir: 'examples', name: ex.id, placements: ex.build(), view: null });
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generate(only?: 'thumbs' | 'examples') {
  const V = (window as unknown as { __vault: { shot: (n: string, d: string) => Promise<unknown> } }).__vault;
  let active = 0;
  const off = onLoadProgress((p) => (active = p.active));
  const saved = useStore.getState().placements;
  useStore.setState({ capture: true, startOpen: false, sourceDialog: false });
  const list = jobs(only);
  let i = 0;
  for (const j of list) {
    useStore.setState({ placements: j.placements, selectedId: null, explodeId: null, viewAngle: j.view });
    await sleep(600);
    for (let quiet = 0; quiet < 3; ) {
      await sleep(500);
      quiet = active === 0 ? quiet + 1 : 0;
    }
    useStore.getState().fitView();
    await sleep(1500);
    await V.shot(j.name, j.dir);
    document.body.dataset.gen = `running ${++i}/${list.length} ${j.name}`;
  }
  off();
  useStore.setState({ placements: saved, capture: false, viewAngle: null });
  useStore.getState().fitView();
  document.body.dataset.gen = `done ${i}`;
}
