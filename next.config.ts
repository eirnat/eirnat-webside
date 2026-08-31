import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler kan bryte event handlers i enkle client-prototyper
  reactCompiler: false,
  async redirects() {
    return [
      {
        source: "/helges-utdrikningslag",
        destination: "/helge",
        permanent: true,
      },
      { source: "/QR", destination: "/qr", permanent: true },
      { source: "/QR/:path*", destination: "/qr/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
