import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Creator Algorithm Tracker',
    template: '%s | Creator Algorithm Tracker',
  },
  description:
    'Track YouTube, YouTube Shorts and TikTok performance with a transparent, account-relative performance score.',
};

export const viewport: Viewport = {
  themeColor: '#07080c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-base-950 text-ink antialiased">{children}</body>
    </html>
  );
}
