export type Width = 'S' | 'M' | 'L' | 'XL';
export type Depth = 3 | 4 | 5 | 6 | 7;
export type Height = 1 | 2 | 4;
export type RoofType = 'grid' | 'table' | 'bowl' | 'underTable' | 'heavyweight';
export type SustainerInterior = 'flat' | 'dividers' | 'sealed';
export type DrawerInterior = 'empty' | 'baseplate';
export type BaseMode = 'wheels' | 'feet';

export type UnitSpec =
  | { type: 'drawer'; width: Width; depth: Depth; height: Height; interior: DrawerInterior }
  | { type: 'sustainer'; width: Width; depth: Depth; height: Height; interior: SustainerInterior }
  | { type: 'roof'; width: Width; depth: Depth; roof: RoofType }
  /** 改装件底座：wheels = 后轮 + 前支脚（推车），feet = 前后支脚 */
  | { type: 'base'; width: Width; depth: Depth; mode: BaseMode };

export type ColorSlot = '结构' | '盒体' | '面板' | '功能件' | '标签' | '内衬';
export const COLOR_SLOTS: ColorSlot[] = ['结构', '盒体', '面板', '功能件', '标签', '内衬'];

export type Vec3 = [number, number, number];

/** 场景中的一个最小单元。pos 是单元包围盒的最小角（左、下、后），单位 mm */
export type Placement = {
  id: string;
  spec: UnitSpec;
  pos: Vec3;
  colors?: Partial<Record<ColorSlot, string>>;
};
