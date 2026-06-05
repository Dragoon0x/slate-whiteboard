import type { Metadata, Viewport } from 'next';
import { PWARegister } from '@/components/PWARegister';
import { ThemeManager } from '@/components/ThemeManager';
import './globals.css';

// Set the theme class before first paint to avoid a flash. Reads the lightweight
// localStorage hint (the authoritative value is loaded from IndexedDB after).
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('slate-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'Slate — local-first whiteboard',
  description:
    'A lightning-fast, local-first infinite whiteboard. No login, no cloud, works offline. Open, draw, share within seconds.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Slate',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Slate' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#fbfbfa',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ThemeManager />
        <PWARegister />
      </body>
    </html>
  );
}
