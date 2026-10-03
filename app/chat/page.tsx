import type { Metadata } from 'next';
import WhatsAppLandingCard from '@/components/WhatsAppLandingCard';

export const metadata: Metadata = {
  title: 'Continue to WhatsApp | City Host',
  description: 'Chat directly with City Host on WhatsApp.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function ChatLandingPage() {
  return (
    <>
      <head>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta httpEquiv="refresh" content="2; url=https://wa.me/15187099695" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var target = "https://wa.me/15187099695";
                try {
                  if (window.location.search) {
                    var p = new URLSearchParams(window.location.search);
                    var t = p.get('text');
                    if (t) { target += "?text=" + encodeURIComponent(t); }
                  }
                  if (window.fbq) {
                    window.fbq('track', 'Contact', { content_name: 'WhatsApp Auto Redirect' });
                  }
                } catch(e) {}
                window.location.href = target;
              })();
            `,
          }}
        />
      </head>
      <WhatsAppLandingCard />
    </>
  );
}
