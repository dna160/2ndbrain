/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the workspace shared package as TypeScript source.
  transpilePackages: ['@recall/shared'],
  // Lint is centralized at the repo root (see .eslintrc.cjs); don't double-run it on build.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
