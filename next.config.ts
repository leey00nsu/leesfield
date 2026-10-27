import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { mediaProxyBodyLimit } from "./src/shared/media-assets/media-upload-limits.mjs";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Workspace AGENTS.md is managed by lee-spec-kit; Next must not rewrite it.
  agentRules: false,
  experimental: {
    proxyClientMaxBodySize: mediaProxyBodyLimit(),
    // Restoring the isolated dev graph after its runtime output is removed
    // causes repeated stale-chunk HMR restarts. Production build caching stays on.
    ...(process.env.SPACES_E2E_MODULE_ROOT ? { turbopackFileSystemCacheForDev: false } : {}),
  },
  // The browser runner uses this in a disposable source workspace.
  distDir: process.env.NODE_STUDIO_E2E_DIST_DIR ?? ".next",
  // The disposable source snapshot resolves packages through its sibling checkout.
  turbopack: process.env.SPACES_E2E_MODULE_ROOT ? { root: process.env.SPACES_E2E_MODULE_ROOT } : undefined,
  outputFileTracingExcludes: process.env.SPACES_E2E_MODULE_ROOT
    ? { "**/*": ["../compiler/**", "../../*/compiler/**"] }
    : undefined,
};

export default withNextIntl(nextConfig);
