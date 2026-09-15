/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  transpilePackages: ["@runas/core"],
  images: { unoptimized: true },
}

export default nextConfig
