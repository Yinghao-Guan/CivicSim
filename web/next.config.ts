import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The map holds an imperative WebGL resource across an effect, and StrictMode's
  // double mount in development keeps that teardown honest.
  reactStrictMode: true,
  // The scripted setup, simulate and results pages became the studio map.
  async redirects() {
    return ["/setup", "/simulate", "/results"].map((source) => ({ source, destination: "/studio", permanent: false }));
  },
};

export default nextConfig;
