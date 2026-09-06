import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Keep Next.js file tracing rooted at the workspace.
  outputFileTracingRoot: projectRoot,

  async rewrites() {
    return [
      {
        source: "/auth/callback",
        destination: "/api/auth/callback",
      },
      {
        source: "/auth/login",
        destination: "/api/auth/login",
      },
      {
        source: "/auth/logout",
        destination: "/api/auth/logout",
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
