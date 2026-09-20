import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],

  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.discordapp.com', pathname: '/avatars/**' }],
  },

  // Keep Next.js file tracing rooted at the workspace.
  outputFileTracingRoot: projectRoot,
  outputFileTracingIncludes: {
    '/api/assets/*': ['./src/assets/**/*'],
  },

  async rewrites() {
    return [
      {
        source: '/auth/callback',
        destination: '/api/auth/callback',
      },
      {
        source: '/auth/login',
        destination: '/api/auth/login',
      },
      {
        source: '/auth/logout',
        destination: '/api/auth/logout',
      },
      {
        source: '/items/:path*',
        destination: '/api/assets/items/:path*',
      },
      {
        source: '/maps/:path*',
        destination: '/api/assets/maps/:path*',
      },
      {
        source: '/favicon.ico',
        destination: '/api/assets/favicon.ico',
      },
    ];
  },
};

export default nextConfig;
