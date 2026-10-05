import path from 'node:path';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Where the Fastify backend lives. The browser never needs to know this URL: by default it calls
 * same-origin `/api/v1/*` and Next proxies those requests here, so no CORS setup is needed on the
 * backend (whose CORS allow-list points at its own port). Read at build time; set it BEFORE `npm run build`.
 */
const backendUrl = (process.env.BACKEND_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
if (!/^https?:\/\/[^/\s]+$/.test(backendUrl)) {
  throw new Error('BACKEND_URL must be an origin such as http://127.0.0.1:3000 (no path).');
}

/** Optional direct-to-backend mode (NEXT_PUBLIC_API_URL): the CSP must allow that origin. */
const directApi = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

const csp = [
  "default-src 'self'",
  // Next.js App Router emits small inline bootstrap scripts; dev tooling additionally needs eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${directApi}${isDev ? ' ws: wss:' : ''}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// This app lives inside the backend repository (which has its own package-lock.json). Pin the workspace
// root to this folder so Next doesn't infer the parent directory. Scripts always run from `frontend/`.
const appRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: appRoot },
  outputFileTracingRoot: appRoot,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${backendUrl}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // CLI tokens travel in API URLs: never leak anything via the Referer header.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
