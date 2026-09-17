import type { Metadata, Viewport } from 'next';
import './globals.css';
import MetaPixel from './components/MetaPixel';
import RegisterSW from './components/RegisterSW';

const appName = 'City Host';

export const metadata: Metadata = {
  title: `${appName} — Meet travellers visiting your city`,
  description:
    'Meet local guides and travellers visiting your city. Chat in City Host — add it to your home screen so replies stay with you.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: appName,
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__pwaInstallPrompt = null;
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.__pwaInstallPrompt = e;
                window.dispatchEvent(new CustomEvent('heartlink:pwa-prompt-ready'));
              });
            `,
          }}
        />
      </head>
      <body className="antialiased app-shell" suppressHydrationWarning>
        <MetaPixel />
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
