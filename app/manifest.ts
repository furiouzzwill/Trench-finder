import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Shortlist',
    short_name: 'Shortlist',
    description: 'Daily read-only meme coin shortlist',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0d10',
    theme_color: '#0b0d10',
    icons: [{ src: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  };
}
