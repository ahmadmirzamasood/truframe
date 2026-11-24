import type { NextConfig } from "next";

// Static export: the site is plain HTML, CSS and JS in `out/`, hostable anywhere.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
