import files from '../config/item-images.json';
import { record } from './inventory';
const normalize = (value: string) =>
  value
    .replace(/\.(png|webp|jpg|jpeg|avif)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const index = new Map<string, string | null>();
for (const file of files) {
  const key = normalize(file);
  index.set(key, index.has(key) ? null : file);
}
const aliases: Record<string, string> = { spice: 'MelangeSpice.png', spicemelange: 'MelangeSpice.png' };
export function itemImage(value: unknown): string | null {
  const item = record(value);
  const candidates = [
    item.icon,
    item.icon_name,
    item.icon_path,
    item.iconPath,
    item.image,
    item.image_path,
    item.imagePath,
    item.template_name,
    item.templateName,
    item.template_id,
    item.templateId,
    item.item_name,
    item.display_name,
    item.name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length > 512) continue;
    // Only serve catalog assets; never return an upstream URL or arbitrary path.
    const basename = candidate.split(/[\\/]/).pop() ?? '';
    const key = normalize(basename);
    const file = index.get(key) ?? aliases[key];
    if (file && files.includes(file)) return `/items/${encodeURIComponent(file)}`;
  }
  return null;
}
