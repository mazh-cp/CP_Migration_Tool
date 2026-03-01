/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@cisco2cp/core', '@cisco2cp/parsers', '@cisco2cp/exporters', '@cisco2cp/ui'],
  serverExternalPackages: ['@prisma/client', 'pino', 'pino-pretty'],
};

module.exports = nextConfig;
