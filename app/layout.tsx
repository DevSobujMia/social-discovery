import type { Metadata, Viewport } from 'next';
import './globals.css';
import MetaPixel from './components/MetaPixel';
import ClarityAnalytics from './components/ClarityAnalytics';
import RegisterSW from './components/RegisterSW';

const appName = 'City Host';

export const metadata: Metadata = {
  title: `${appName} — Travellers visiting your city`,
  description:
    'Share your trip on City Host. Locals in that city find who is coming and message on the site.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    shortcut: '/icon-192.png',
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
  themeColor: '#020617',
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
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__pwaInstallPrompt = null;
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.__pwaInstallPrompt = e;
                window.dispatchEvent(new CustomEvent('cityhost:pwa-prompt-ready'));
                window.dispatchEvent(new CustomEvent('heartlink:pwa-prompt-ready'));
              });

              // Self-healing CSS: detect broken/404 stylesheet links (e.g. after a redeploy)
              window.addEventListener('error', function(e) {
                var target = e.target || e.srcElement;
                if (target && target.nodeName === 'LINK' && target.rel === 'stylesheet') {
                  var key = 'css_heal_' + (target.href || 'sheet');
                  if (!sessionStorage.getItem(key)) {
                    sessionStorage.setItem(key, '1');
                    window.location.reload();
                  }
                }
              }, true);

              // Verify CSS is rendered after mobile browser wakes up from background / suspended tab
              function verifyStyles() {
                var el = document.createElement('div');
                el.className = 'hidden';
                (document.body || document.documentElement).appendChild(el);
                var isStyled = window.getComputedStyle(el).display === 'none';
                el.remove();
                if (!isStyled && !sessionStorage.getItem('css_fouc_reload')) {
                  sessionStorage.setItem('css_fouc_reload', '1');
                  window.location.reload();
                } else if (isStyled) {
                  sessionStorage.removeItem('css_fouc_reload');
                }
              }

              window.addEventListener('pageshow', function(e) {
                if (e.persisted) {
                  requestAnimationFrame(function() {
                    verifyStyles();
                  });
                }
              });
            `,
          }}
        />
      </head>
      <body className="antialiased app-shell" suppressHydrationWarning>
        <MetaPixel />
        <ClarityAnalytics />
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
