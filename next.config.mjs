/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Adicione esta linha
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
