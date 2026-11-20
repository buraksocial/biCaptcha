import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
};

export default nextConfig;
