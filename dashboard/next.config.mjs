/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'undici'],
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // better-sqlite3 uses the `bindings` package which calls __filename at runtime.
      // webpack replaces __filename with undefined in bundled code, breaking native .node loading.
      // Force both packages as CJS externals so they run un-bundled in Node.
      const nativeExternals = ['better-sqlite3', 'bindings'];
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : (config.externals ? [config.externals] : [])),
        (ctx, callback) => {
          if (ctx.request && nativeExternals.some(pkg => ctx.request === pkg || ctx.request.startsWith(pkg + '/'))) {
            return callback(null, `commonjs ${ctx.request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
