import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for Docker/Fly.io
  output: "standalone",
  
  // Keep server-rendering predictable in constrained build environments
  skipTrailingSlashRedirect: true,
  
  // Skip build-time page generation
  experimental: {
    // Disable all automatic static optimization
    workerThreads: false,
    cpus: 1,
  },

  // Ignore lint/type errors during build
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Disable Next.js image optimization (keeps things simple in Docker)
  images: { unoptimized: true },

  // Public env vars should use NEXT_PUBLIC_* and be provided at build time.
  // No provider-specific variables are inlined here.

  // Security Headers
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ],
      },
    ];
  },

  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Use process.cwd() instead of __dirname for Docker builds
      "@": path.join(process.cwd()),
    };
    return config;
  },
};

export default nextConfig;
