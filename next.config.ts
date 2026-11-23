import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // POS membaca data live dari Postgres tiap request; pakai SSR dinamis klasik.
  cacheComponents: false,
};

export default nextConfig;
