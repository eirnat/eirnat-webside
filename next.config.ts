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
    ];
  },
};

export default nextConfig;
