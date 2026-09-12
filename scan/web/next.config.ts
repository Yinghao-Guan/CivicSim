import type { NextConfig } from "next";

/**
 * The scan API runs on :8001. Proxying it under /scan-api keeps the phone page
 * same-origin, so one HTTPS tunnel to :3001 serves both page and API (the
 * browser only exposes geolocation on HTTPS).
 */
const SCAN_API_URL = process.env.SCAN_API_URL ?? "http://localhost:8001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app", "*.local"],
  async rewrites() {
    return [{ source: "/scan-api/:path*", destination: `${SCAN_API_URL}/:path*` }];
  },
};

export default nextConfig;
