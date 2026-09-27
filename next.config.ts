import type { NextConfig } from 'next';
import { HOSTS_IMAGENS } from './src/lib/imagens';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: HOSTS_IMAGENS.map(hostname => ({ protocol: 'https' as const, hostname })),
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // VPS com pouca memória: um worker só no build.
    cpus: 1,
  },
};

export default nextConfig;
