import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // Fully static: one HTML file per route, served from any static host
  // (browser-sandbox.faustine.ai is a DigitalOcean App Platform static site).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // The repository has its own lockfile one level up; the site is its own workspace.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
