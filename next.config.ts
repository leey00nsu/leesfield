import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { mediaProxyBodyLimit } from "./src/shared/media-assets/media-upload-limits.mjs";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Disposable browser checks must not generate policy files in the checkout.
  agentRules: process.env.SPACES_E2E_ISOLATED === "1" ? false : undefined,
  experimental: { proxyClientMaxBodySize: mediaProxyBodyLimit() },
  // The browser suite can run beside the user's development server.
  distDir: process.env.NODE_STUDIO_E2E_DIST_DIR ?? ".next",
};

export default withNextIntl(nextConfig);
