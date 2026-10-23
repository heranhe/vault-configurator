import type { UnitSpec } from '../core/types';

export const DEMO_SPECS: UnitSpec[] = [
  { type: 'drawer', width: 'S', depth: 5, height: 1, interior: 'empty' },
  { type: 'drawer', width: 'S', depth: 5, height: 2, interior: 'empty' },
  { type: 'sustainer', width: 'S', depth: 5, height: 1, interior: 'flat' },
  { type: 'sustainer', width: 'S', depth: 5, height: 2, interior: 'flat' },
];
export function isDemoSpec(spec: UnitSpec) {
  return spec.width === 'S' && spec.depth === 5 &&
    (spec.type === 'drawer' && (spec.height === 1 || spec.height === 2) && spec.interior === 'empty' ||
     spec.type === 'sustainer' && (spec.height === 1 || spec.height === 2) && spec.interior === 'flat');
}
