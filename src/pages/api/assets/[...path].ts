import '../../../lib/assert-server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const assetRoot = path.resolve(process.cwd(), 'src', 'assets');
const contentTypes = Object.freeze({
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
});

function resolveAsset(parts: unknown): { file: string; contentType: string } | null {
  if (!Array.isArray(parts) || parts.some((part) => typeof part !== 'string')) return null;
  const segments = parts as string[];
  const validFile =
    (segments.length === 1 && segments[0] === 'favicon.ico') ||
    (segments.length === 2 && ['items', 'maps'].includes(segments[0]));
  if (
    !validFile ||
    segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\/]/.test(segment))
  )
    return null;

  const extension = path.extname(segments.at(-1)!).toLowerCase();
  const contentType = contentTypes[extension as keyof typeof contentTypes];
  if (!contentType) return null;

  const file = path.resolve(assetRoot, ...segments);
  if (!file.startsWith(`${assetRoot}${path.sep}`)) return null;
  return { file, contentType };
}

export default async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  const asset = resolveAsset(req.query.path);
  if (!asset) return res.status(404).end();

  try {
    const body = await readFile(asset.file);
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Content-Length', String(body.byteLength));
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(body);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return res.status(404).end();
    return res.status(500).end();
  }
}
