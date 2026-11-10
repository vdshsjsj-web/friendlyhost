import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: 'Jasfer Hosting — Minecraft server hosting that really runs',
    template: '%s · Jasfer Hosting',
  },
  description:
    'Jasfer Hosting is an open-source Minecraft hosting panel with a real Java runtime, live console, file manager, plugin installer and Pterodactyl-compatible node adapter.',
  applicationName: 'Jasfer Hosting',
  keywords: ['Minecraft hosting', 'Paper', 'Purpur', 'Fabric', 'Forge', 'Pterodactyl', 'server panel'],
  openGraph: {
    title: 'Jasfer Hosting',
    description: 'Premium Minecraft hosting panel — real servers, real console, open source.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#08060f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-void-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
