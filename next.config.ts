import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The browser suite can run beside the user's development server.
  distDir: process.env.NODE_STUDIO_E2E_DIST_DIR ?? ".next",
};

export default withNextIntl(nextConfig);
