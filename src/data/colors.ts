// 拓竹 PLA Basic 色号（原型用）。色号与 HEX 尚未逐一对照官网，Light Gray 10104 已由说明书确认
export type BambuColor = { id: string; nameZh: string; nameEn: string; hex: string };

export const PLA_BASIC: BambuColor[] = [
  { id: '10100', nameZh: '象牙白', nameEn: 'Jade White', hex: '#F4F4F1' },
  { id: '10104', nameZh: '浅灰', nameEn: 'Light Gray', hex: '#D1D3D5' },
  { id: '10102', nameZh: '银色', nameEn: 'Silver', hex: '#A6A9AA' },
  { id: '10103', nameZh: '灰色', nameEn: 'Gray', hex: '#8E9089' },
  { id: '10105', nameZh: '深灰', nameEn: 'Dark Gray', hex: '#545454' },
  { id: '10101', nameZh: '黑色', nameEn: 'Black', hex: '#1B1B1B' },
  { id: '10300', nameZh: '橙色', nameEn: 'Orange', hex: '#FF6A13' },
  { id: '10200', nameZh: '红色', nameEn: 'Red', hex: '#C12E1F' },
  { id: '10203', nameZh: '粉色', nameEn: 'Pink', hex: '#F55A74' },
  { id: '10400', nameZh: '黄色', nameEn: 'Yellow', hex: '#F4EE2A' },
  { id: '10401', nameZh: '金色', nameEn: 'Gold', hex: '#E4BD68' },
  { id: '10201', nameZh: '米色', nameEn: 'Beige', hex: '#F7E6DE' },
  { id: '10800', nameZh: '棕色', nameEn: 'Brown', hex: '#9D432C' },
  { id: '10501', nameZh: '拓竹绿', nameEn: 'Bambu Green', hex: '#00AE42' },
  { id: '10603', nameZh: '青色', nameEn: 'Cyan', hex: '#0086D6' },
  { id: '10601', nameZh: '蓝色', nameEn: 'Blue', hex: '#0A2989' },
  { id: '10700', nameZh: '紫色', nameEn: 'Purple', hex: '#5E43B7' },
  { id: '10202', nameZh: '品红', nameEn: 'Magenta', hex: '#EC008C' },
];

export const colorById = (id: string) => PLA_BASIC.find((c) => c.id === id) ?? PLA_BASIC[1];
