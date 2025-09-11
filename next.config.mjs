import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for Docker/Fly.io
  output: "standalone",

  // Ignore lint/type errors during build
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Disable Next.js image optimization (keeps things simple in Docker)
  images: { unoptimized: true },

  // Only expose public env vars
  env: {
    CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    // ❌ Do NOT expose CLERK_SECRET_KEY (keep server-side only)
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
