import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The map holds an imperative WebGL resource across an effect, and StrictMode's
  // double mount in development keeps that teardown honest.
  reactStrictMode: true,
};

export default nextConfig;
