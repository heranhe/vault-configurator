import { create } from 'zustand';
import { autoPlace, columnOf, type Drop } from './core/rules';
import type { ColorSlot, Placement, UnitSpec, Vec3 } from './core/types';
import type { ModelSource } from './models/source';

export type DragState = {
  spec: UnitSpec;
  /** 从场景拖动已有单元时：被拖的单元 id 和随它一起移动的整列 */
  baseId?: string;
  groupIds: string[];
  /** 抓取点相对单元最小角的偏移和高度，拖动时保持手感，不让单元跳到指针中心 */
  grab?: { dx: number; dz: number; y: number };
  drop: Drop | null;
};

type State = {
  placements: Placement[];
  past: Placement[][];
  future: Placement[][];
  selectedId: string | null;
  explodeId: string | null;
  explodeT: number;
  xray: boolean;
  palette: Record<ColorSlot, string>;
  colorScope: 'all' | 'unit';
  drag: DragState | null;
  toast: { text: string; kind: 'error' | 'info'; at: number } | null;
  source: ModelSource | null;
  /** 本地服务器能否按路径读取（npm run dev 时为 true） */
  pathSupported: boolean;
  /** 用户选的预设视角（方位角, 俯仰角），取景时沿用 */
  viewAngle: [number, number] | null;
  /** 开发用：生成缩略图时为 true */
  capture: boolean;
  sourceDialog: boolean;
  /** 开始面板（新手引导 + 新建 + 示例） */
  startOpen: boolean;
  fitNonce: number;

  commit: (next: Placement[]) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  startDrag: (d: Omit<DragState, 'drop'>) => void;
  setDrop: (drop: Drop | null) => void;
  endDrag: () => void;
  clickAdd: (spec: UnitSpec) => void;
  removeSelected: () => void;
  updateSpec: (id: string, spec: UnitSpec) => void;
  setColor: (slot: ColorSlot, colorId: string) => void;
  setExplode: (id: string | null) => void;
  setExplodeT: (t: number) => void;
  setXray: (on: boolean) => void;
  setColorScope: (s: 'all' | 'unit') => void;
  notify: (text: string, kind?: 'error' | 'info') => void;
  setSource: (s: ModelSource | null) => void;
  clearAll: () => void;
  loadExample: (placements: Placement[]) => void;
  fitView: () => void;
};

let seq = 1;
const newId = () => `u${Date.now().toString(36)}${seq++}`;
const STORAGE_KEY = 'vault-prototype-v3'; // v2：叠放节距改为 48 mm/F；v3：默认配色改为白 + 橙色点缀

function load(): Pick<State, 'placements' | 'palette'> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const saved = load();

export const DEFAULT_PALETTE: Record<ColorSlot, string> = {
  // 参考官网渲染图：白色机身和面板，橙色只用在把手、锁扣、铰链等小件上作点缀
  结构: '10100',
  盒体: '10105',
  面板: '10100',
  功能件: '10300',
  标签: '10104',
  内衬: '10104',
};

export const useStore = create<State>((set, get) => ({
  placements: saved?.placements ?? [],
  past: [],
  future: [],
  selectedId: null,
  explodeId: null,
  explodeT: 0.7,
  xray: false,
  palette: { ...DEFAULT_PALETTE, ...saved?.palette },
  colorScope: 'all',
  drag: null,
  toast: null,
  source: null,
  pathSupported: false,
  viewAngle: null,
  capture: false,
  sourceDialog: false,
  startOpen: false,
  fitNonce: 0,

  commit: (next) => set((s) => ({ placements: next, past: [...s.past.slice(-99), s.placements], future: [] })),
  undo: () =>
    set((s) => (s.past.length ? { placements: s.past.at(-1)!, past: s.past.slice(0, -1), future: [s.placements, ...s.future], explodeId: null } : s)),
  redo: () =>
    set((s) => (s.future.length ? { placements: s.future[0], future: s.future.slice(1), past: [...s.past, s.placements], explodeId: null } : s)),
  select: (id) => set({ selectedId: id }),

  startDrag: (d) => {
    document.body.classList.add('dragging');
    set({ drag: { ...d, drop: null }, explodeId: null });
  },
  setDrop: (drop) => set((s) => (s.drag ? { drag: { ...s.drag, drop } } : s)),
  endDrag: () => {
    document.body.classList.remove('dragging');
    const { drag, placements, commit, notify } = get();
    set({ drag: null });
    if (!drag?.drop) return;
    if (!drag.drop.ok) {
      notify(drag.drop.reason ?? '这里放不下', 'error');
      return;
    }
    const pos = drag.drop.pos;
    if (drag.baseId) {
      const base = placements.find((p) => p.id === drag.baseId)!;
      const delta: Vec3 = [pos[0] - base.pos[0], pos[1] - base.pos[1], pos[2] - base.pos[2]];
      if (delta.every((v) => Math.abs(v) < 0.01)) return;
      commit(placements.map((p) => (drag.groupIds.includes(p.id) ? { ...p, pos: [p.pos[0] + delta[0], p.pos[1] + delta[1], p.pos[2] + delta[2]] } : p)));
      set({ selectedId: drag.baseId });
    } else {
      const id = newId();
      commit([...placements, { id, spec: drag.spec, pos }]);
      set({ selectedId: id });
    }
  },

  clickAdd: (spec) => {
    const { placements, selectedId, commit, notify } = get();
    // 连续点击：叠到选中的塔上；没有选中时叠到最近放的那座塔上
    const targetId = selectedId ?? placements.at(-1)?.id ?? null;
    const r = autoPlace(spec, placements, targetId);
    if (!r.ok) return notify(r.reason ?? '没有可放的位置', 'error');
    const id = newId();
    commit([...placements, { id, spec, pos: r.pos }]);
    set({ selectedId: id });
    if (targetId && r.pos[1] === 0) notify('规格不能叠在这座塔上，已放到旁边空地', 'info');
  },

  removeSelected: () => {
    const { selectedId, placements, commit, notify } = get();
    if (!selectedId) return;
    const col = columnOf(selectedId, placements);
    if (col.blocked) return notify(col.blocked, 'error');
    commit(placements.filter((p) => !col.ids.includes(p.id)));
    set({ selectedId: null, explodeId: null });
    if (col.ids.length > 1) notify(`已删除 ${col.ids.length} 个单元（含上方叠放的），可撤销`, 'info');
  },

  updateSpec: (id, spec) => {
    const { placements, commit } = get();
    commit(placements.map((p) => (p.id === id ? { ...p, spec } : p)));
  },

  setColor: (slot, colorId) => {
    const { colorScope, selectedId, placements, commit } = get();
    if (colorScope === 'unit' && selectedId) {
      commit(placements.map((p) => (p.id === selectedId ? { ...p, colors: { ...p.colors, [slot]: colorId } } : p)));
    } else {
      set((s) => ({ palette: { ...s.palette, [slot]: colorId } }));
    }
  },

  setExplode: (id) => set({ explodeId: id, selectedId: id ?? get().selectedId }),
  setExplodeT: (t) => set({ explodeT: t }),
  setXray: (on) => set({ xray: on }),
  setColorScope: (colorScope) => set({ colorScope }),
  notify: (text, kind = 'info') => set({ toast: { text, kind, at: Date.now() } }),
  setSource: (source) => set({ source, sourceDialog: false }),
  clearAll: () => {
    get().commit([]);
    set({ selectedId: null, explodeId: null });
  },
  loadExample: (next) => {
    get().commit(next);
    set((s) => ({ selectedId: null, explodeId: null, viewAngle: null, fitNonce: s.fitNonce + 1 }));
  },
  fitView: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}));

// 自动保存（原型阶段用 localStorage，正式版改为 IndexedDB 多方案）
useStore.subscribe((s, prev) => {
  if (s.placements === prev.placements && s.palette === prev.palette) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ placements: s.placements, palette: s.palette }));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
});
