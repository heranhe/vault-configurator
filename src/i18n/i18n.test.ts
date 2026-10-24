import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLocale, syncDocumentLocale, t, tf, useLocale, LOCALE_KEY } from './index';
import { en } from './en';
import { DEPTHS, heightsFor, ROOF_TYPES, specName, WIDTHS } from '../core/dims';
import { assemblyOf } from '../core/assembly';
import { hardwareOf, partsOf } from '../core/parts';
import { partInstances } from '../scene/part-instances';
import type { UnitSpec } from '../core/types';
import { buildBom, bomCsv } from '../core/bom';
import { DEFAULT_PALETTE } from '../store';
import { readme, zipEntryName } from '../export/pack';

function specs() {
  const all: UnitSpec[] = [];
  for (const width of WIDTHS) for (const depth of DEPTHS) {
    for (const height of heightsFor(width)) {
      for (const interior of ['empty', 'baseplate'] as const) all.push({ type: 'drawer', width, depth, height, interior });
      for (const interior of ['flat', 'dividers', 'sealed'] as const) all.push({ type: 'sustainer', width, depth, height, interior });
    }
    for (const roof of ROOF_TYPES) if (roof !== 'heavyweight' || width === 'L' || width === 'XL') all.push({ type: 'roof', width, depth, roof });
    for (const mode of ['feet', 'wheels'] as const) all.push({ type: 'base', width, depth, mode });
  }
  return all;
}

afterEach(() => { useLocale.setState({ locale: 'zh' }); vi.unstubAllGlobals(); });

describe('language preference', () => {
  it('defaults safely with no storage, invalid preferences or blocked file storage', () => {
    expect(readLocale({ getItem: () => null })).toBe('zh');
    expect(readLocale({ getItem: () => 'fr' })).toBe('zh');
    expect(readLocale({ getItem: () => { throw new Error('SecurityError'); } })).toBe('zh');
    expect(readLocale({ getItem: () => 'en' })).toBe('en');
  });
  it('persists separately and still switches when storage is blocked', () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) });
    useLocale.getState().setLocale('en');
    expect(saved.get(LOCALE_KEY)).toBe('en');
    expect(readLocale()).toBe('en');
    expect(t('零件库')).toBe('Library');
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('SecurityError'); } });
    useLocale.getState().setLocale('zh');
    expect(t('零件库')).toBe('零件库');
  });
  it('updates the document language and title', () => {
    const doc = { documentElement: { lang: '' }, title: '' };
    vi.stubGlobal('document', doc);
    syncDocumentLocale('en');
    expect(doc).toEqual({ documentElement: { lang: 'en' }, title: 'VAULT Configurator' });
    syncDocumentLocale('zh');
    expect(doc.documentElement.lang).toBe('zh-CN');
  });
});

describe('translation coverage', () => {
  it('preserves placeholders and translates all static source copy', () => {
    for (const [key, value] of Object.entries(en)) {
      expect([...value.matchAll(/\{\d+\}/g)].map((x) => x[0]).sort(), key).toEqual([...key.matchAll(/\{\d+\}/g)].map((x) => x[0]).sort());
      if (!/\{\d+\}/.test(key)) expect(t(key, 'en'), key).toBe(value);
    }
  });
  it('translates every legal size, assembly instruction, hardware and individual callout', () => {
    const untranslated = new Set<string>();
    const check = (value: string) => { if (/\p{Script=Han}/u.test(t(value, 'en'))) untranslated.add(value); };
    for (const spec of specs()) {
      check(specName(spec));
      for (const part of partsOf(spec)) {
        check(part.name);
        check(`查看 Example File：${part.name}`);
        check(`点击在所属单元的爆炸图中高亮：${part.name}\nmodel/file.stl`);
        partInstances(part).forEach((p) => check(p.name));
      }
      for (const step of assemblyOf(spec)) { check(step.title); check(step.note); check(step.ref); }
      Object.keys(hardwareOf(spec)).forEach(check);
    }
    expect([...untranslated]).toEqual([]);
  });
  it('translates existing dynamic messages and reorders counters', () => {
    expect(t('已删除 3 个单元（含上方叠放的），可撤销', 'en')).toBe('Deleted 3 units, including those stacked above. Undo is available.');
    expect(t('上方的 S5 · 1F 抽屉 同时压在别的单元上，请先移开它', 'en')).toContain('S5 · 1F drawer');
    expect(tf('第 {0} / {1} 步', [2, 12], 'en')).toBe('Step 2 / 12');
    expect(t(' 打印件 ', 'en')).toBe(' Printed parts ');
  });
  it('exports localized CSV and ZIP descriptions while preserving paths and quantities', () => {
    const { rows, hardware } = buildBom([{ id: 'test', pos: [0, 0, 0], spec: { type: 'drawer', width: 'S', depth: 5, height: 1, interior: 'empty' } }], DEFAULT_PALETTE);
    const before = JSON.stringify({ rows, hardware });
    expect(bomCsv(rows, hardware, 'en')).toContain('"Print copies","Pieces per copy","Total pieces"');
    expect(bomCsv(rows, hardware, 'en')).not.toMatch(/\p{Script=Han}/u);
    expect(bomCsv(rows, hardware, 'zh')).toContain('"打印份数"');
    expect(readme(rows, hardware, 'en')).not.toMatch(/\p{Script=Han}/u);
    expect(zipEntryName(rows[0], 'en')).not.toMatch(/\p{Script=Han}/u);
    expect(bomCsv(rows, hardware, 'en')).toContain(rows[0].path);
    expect(JSON.stringify({ rows, hardware })).toBe(before);
  });
});
