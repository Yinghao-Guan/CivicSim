import type { NextConfig } from "next";

/** The resident scan app (scan/web) and its API, reached through this app's origin. */
const SCAN_WEB_URL = process.env.SCAN_WEB_URL ?? "http://localhost:3001";
const SCAN_API_URL = process.env.SCAN_API_URL ?? "http://localhost:8001";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The map holds an imperative WebGL resource across an effect, and StrictMode's
  // double mount in development keeps that teardown honest.
  reactStrictMode: true,
  // The scripted setup, simulate and results pages became the studio map.
  // Phones reach the scan pages over an HTTPS tunnel to this app.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app", "*.local"],
  // Multi-zone: /community is scan/web (basePath "/community"); /scan-api is its API.
  async rewrites() {
    return [
      { source: "/community", destination: `${SCAN_WEB_URL}/community` },
      { source: "/community/:path*", destination: `${SCAN_WEB_URL}/community/:path*` },
      { source: "/scan-api/:path*", destination: `${SCAN_API_URL}/:path*` },
    ];
  },
  async redirects() {
    return ["/setup", "/simulate", "/results"].map((source) => ({ source, destination: "/studio", permanent: false }));
  },
};

export default nextConfig;
