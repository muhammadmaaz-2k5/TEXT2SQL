/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@datapilot/ui', '@datapilot/types', '@datapilot/sql-guard'],
  reactStrictMode: true,
};

export default nextConfig;

