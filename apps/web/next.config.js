/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@cisco2cp/core', '@cisco2cp/parsers', '@cisco2cp/exporters', '@cisco2cp/ui'],
  serverExternalPackages: ['@prisma/client', 'pino', 'pino-pretty', 'node-cron'],
  webpack(config, { dev, isServer }) {
    // Dev client: slow compile or first visit can exceed default chunk wait; reduces ChunkLoadError timeouts.
    if (dev && !isServer) {
      config.output = { ...config.output, chunkLoadTimeout: 300_000 };
    }
    return config;
  },
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
