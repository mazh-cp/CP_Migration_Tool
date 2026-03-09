/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@cisco2cp/core', '@cisco2cp/parsers', '@cisco2cp/exporters', '@cisco2cp/ui'],
  serverExternalPackages: ['@prisma/client', 'pino', 'pino-pretty'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
