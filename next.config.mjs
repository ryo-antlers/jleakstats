/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // FANTYPE: 旧 /jlsp/* を /fantype/* に 301 リダイレクト
      // (B-3-2 で app/jlsp → app/fantype 移行済み)
      { source: '/jlsp', destination: '/fantype', permanent: true },
      { source: '/jlsp/:path*', destination: '/fantype/:path*', permanent: true },
    ]
  },
};

export default nextConfig;
