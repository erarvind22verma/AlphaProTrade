import type { NextConfig } from 'next'

const payloadURL = (process.env.PAYLOAD_URL || 'http://localhost:3000').replace(/\/$/, '')

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${payloadURL}/api/:path*` }]
  },
}

export default nextConfig
