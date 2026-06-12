import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  if (process.env.DEMO_MODE === 'true') {
    return {
      rules: {
        userAgent: '*',
        allow: ['/sign-in', '/api/public/'],
        disallow: ['/admin'],
      },
    };
  }
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}

