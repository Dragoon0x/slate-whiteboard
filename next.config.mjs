/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static, client-only build. Deployable anywhere, works offline.
  output: 'export',
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // The canvas app is entirely client-side; skip type/lint gating on build
  // so the produced static bundle is the source of truth.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
