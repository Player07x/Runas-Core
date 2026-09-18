/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  transpilePackages: ["@runas/core", "@runas/vtt-bridge"],
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
