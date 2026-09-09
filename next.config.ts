import { withSentryConfig } from '@sentry/nextjs/config';
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
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: process.env.SENTRY_ORG,

  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Use Sentry's direct transport. Next 16.3's external rewrite proxy adds
  // enough response listeners to warn when combined with monitoring.

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
