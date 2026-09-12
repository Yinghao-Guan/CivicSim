import type { NextConfig } from "next";

/**
 * The scan API runs on :8001. Proxying it under /scan-api keeps the phone page
 * same-origin, so one HTTPS tunnel to :3001 serves both page and API (the
 * browser only exposes geolocation on HTTPS).
 */
const SCAN_API_URL = process.env.SCAN_API_URL ?? "http://localhost:8001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Served as a zone of the main web app: web/ proxies /community/* here, so the
  // board and the phone page share the studio's origin (and one HTTPS tunnel).
  basePath: "/community",
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app", "*.local"],
  async rewrites() {
    // basePath: false keeps the API at the origin root, where web/ also proxies it.
    return [{ source: "/scan-api/:path*", destination: `${SCAN_API_URL}/:path*`, basePath: false }];
  },
};

export default nextConfig;
