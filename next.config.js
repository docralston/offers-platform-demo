/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Prevent clickjacking — page cannot be embedded in iframes on other origins
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't send the full referrer URL to external sites
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Limit browser feature access
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  ...(process.env.DEMO_MODE === 'true'
    ? []
    : [{
        key: 'X-Robots-Tag',
        value: 'noindex, nofollow, noarchive, nosnippet',
      }]),
  // Content Security Policy — tightened for an admin-only app
  // Adjust 'clerk.*.accounts.dev' hosts if using a custom Clerk domain
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Scripts: self + Clerk's hosted JS
      "script-src 'self' 'unsafe-inline' https://clerk.com https://*.clerk.accounts.dev",
      // Styles: self + inline (needed by Tailwind / Clerk UI)
      "style-src 'self' 'unsafe-inline'",
      // Images: self + data URIs (for base64 thumbnails) + https
      "img-src 'self' data: https:",
      // Fonts: self
      "font-src 'self'",
      // Connections: self + Clerk API + Supabase (adjust host as needed)
      "connect-src 'self' https://*.clerk.accounts.dev https://*.supabase.co https://api.openai.com",
      // Frames: Clerk's hosted UI
      "frame-src 'self' https://clerk.com https://*.clerk.accounts.dev",
      // No plugins
      "object-src 'none'",
      // Force HTTPS in production only (localhost uses HTTP in dev)
      ...(process.env.NODE_ENV === 'production' ? ["upgrade-insecure-requests"] : []),
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core', 'sharp'],
  outputFileTracingIncludes: {
    '/admin/images': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/*': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
