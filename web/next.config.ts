import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicit rather than relying on the default: the map component holds an
  // imperative WebGL resource across an effect, and StrictMode's double
  // mount in development is the cheapest way to keep that teardown honest.
  reactStrictMode: true,
};

export default nextConfig;
