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
      <head>
        {/*
          Bold display fonts for Studio's thumbnail text layers. Loaded via a
          plain stylesheet link (not next/font) deliberately: Konva draws text
          on a <canvas>, and the Canvas 2D API's `font` property needs a real,
          literal font-family name - next/font/google's build-hashed names
          don't work there. See src/components/studio/fonts.ts.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Oswald:wght@500;700&family=Archivo+Black&family=Bangers&display=swap"
        />
      </head>
      <body className="min-h-screen bg-base-950 text-ink antialiased">{children}</body>
    </html>
  );
}
