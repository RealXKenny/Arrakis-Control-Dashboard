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

  // Dev note: show the standalone build where the image spice is buried.
  outputFileTracingRoot: projectRoot,
  outputFileTracingIncludes: {
    '/api/assets/*': ['./src/assets/**/*'],
  },

  async redirects() {
    // Dev note: one front door is plenty; query strings travel with the visitor.
    return [
      { source: '/home', destination: '/', permanent: false },
      // Old sign-in links keep working now that Auth.js owns the login screen.
      { source: '/auth/login', destination: '/login', permanent: false },
    ];
  },

  async rewrites() {
    return [
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
