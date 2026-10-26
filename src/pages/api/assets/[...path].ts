import '../../../lib/assert-server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const config = {
  api: {
    responseLimit: '8mb',
  },
};

const assetRoot = path.resolve(process.cwd(), 'src', 'assets');
const contentTypes = Object.freeze({
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gz': 'application/gzip',
});

function isTerrainAsset(segments: string[]) {
  const name = segments.slice(1).join('/');
  return /^(?:meshes\.(?:json|bin)|layout-(?:[0-9]|1[01])\.(?:json|bin|hf)|tex\/(?:det1|det2|brk)\.rgba)\.gz$/.test(
    name,
  );
}

function isTiledMapAsset(segments: string[]) {
  return (
    segments.length === 3 &&
    segments[0] === 'maps' &&
    /^(?:deep-desert|hagga-basin)$/.test(segments[1]) &&
    /^(?:0|1)-(?:0|1)\.webp$/.test(segments[2])
  );
}

function resolveAsset(parts: unknown): { file: string; contentType: string } | null {
  if (!Array.isArray(parts) || parts.some((part) => typeof part !== 'string')) return null;
  const segments = parts as string[];
  const validFile =
    (segments.length === 1 && segments[0] === 'favicon.ico') ||
    (segments.length === 2 && ['items', 'maps'].includes(segments[0])) ||
    isTiledMapAsset(segments) ||
    (segments[0] === 'terrain' && isTerrainAsset(segments));
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
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Length', String(body.byteLength));
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(body);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return res.status(404).end();
    return res.status(500).end();
  }
}
