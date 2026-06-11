import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next transpiles them in-place.
  transpilePackages: ['@regdelta/core', '@regdelta/pipeline'],
};

export default nextConfig;
