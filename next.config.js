/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      "/api/meme": ["./lib/assets/base.jpg", "./lib/fonts/BigShoulders-Bold.ttf"],
    },
  },
};

module.exports = nextConfig;
