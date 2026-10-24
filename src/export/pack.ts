import { t, useLocale, type Locale } from '../i18n';
// 把选中的零件从用户本地复制打包。模型文件只在用户电脑上读写，不上传
import { bomCsv, type BomRow } from '../core/bom';
import { colorById } from '../data/colors';
import { lookup, type ModelSource } from '../models/source';

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_');

export function zipEntryName(r: BomRow, locale: Locale = useLocale.getState().locale) {
  const c = colorById(r.colorId);
  const base = r.fileName.replace(/\s*\(Turn On Supports\)/i, '').replace(/\s*\.stl$/i, '');
  const tag = r.supports ? ` ${t('[开支撑]', locale)}` : '';
  return `${safe(`${locale === 'en' ? '' : c.nameZh + '_'}${c.nameEn.replace(/\s/g, '')}_${c.id}`)}/${safe(base)}${tag}__x${r.qty}.stl`;
}

/** 流式打包：Chrome / Edge 直接写到磁盘，不占内存；其他浏览器退回 Blob 下载 */
export async function packZip(rows: BomRow[], hardware: Record<string, number>, source: ModelSource, projectJson: string, onProgress: (n: number, total: number) => void) {
  const locale = useLocale.getState().locale;
  const date = new Date().toISOString().slice(0, 10);
  const name = t(`VAULT_方案_${date}.zip`, locale);
  // 在异步加载打包库前打开保存窗口，保留浏览器要求的用户手势授权。
  const w = window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> };
  const handle = w.showSaveFilePicker
    ? await w.showSaveFilePicker({ suggestedName: name, types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }] })
    : null;
  const { downloadZip } = await import('client-zip');
  const total = rows.length;
  let n = 0;
  async function* entries() {
    yield { name: t('清单.csv', locale), input: bomCsv(rows, hardware, locale) };
    yield { name: t('方案.json', locale), input: projectJson };
    yield { name: 'README.txt', input: readme(rows, hardware, locale) };
    for (const r of rows) {
      const f = lookup(source, r.path);
      if (!f) continue;
      yield { name: zipEntryName(r, locale), input: await f.read() };
      onProgress(++n, total);
    }
  }
  const resp = downloadZip(entries());
  if (handle) {
    const writable = await (handle as FileSystemFileHandle & { createWritable(): Promise<WritableStream> }).createWritable();
    await resp.body!.pipeTo(writable);
  } else {
    const blob = await resp.blob();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}

export function readme(rows: BomRow[], hardware: Record<string, number>, locale: Locale = useLocale.getState().locale) {
  const sup = rows.filter((r) => r.supports).map((r) => `  - ${r.fileName}`);
  const hw = Object.entries(hardware).map(([k, v]) => `  - ${t(k, locale)} ×${v}`);
  return [
    'VAULT 模块化收纳系统 · 打印包',
    '',
    '文件夹按颜色分组，文件名末尾 __xN 表示需要打印 N 份。',
    '一份 STL 可能包含多个独立零件；每份件数和零件总数见打印清单 CSV，不需要把成套文件重复打印。',
    '标记为可复用工装的文件仅需打印清单中的份数，可用于方案内多套组件，装配完成后取下。',
    '材料：PLA，Bambu Studio 标准参数即可；想更结实可增加墙数/填充，或用 PETG。',
    '',
    '切片时必须开启支撑的零件：',
    ...(sup.length ? sup : ['  （无）']),
    '',
    '需另购五金件：',
    ...(hw.length ? hw : ['  （无）']),
    '',
    '标注「数量待确认」的零件数量为估算，请对照说明书核对。',
  ].map((line) => line.startsWith('  - ') ? line : t(line, locale)).join('\r\n');
}
