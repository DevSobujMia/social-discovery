import type { Metadata } from 'next';
import WhatsAppLandingCard from '@/components/WhatsAppLandingCard';

export const metadata: Metadata = {
  title: 'Chat on WhatsApp | City Host',
  description: 'Connect directly with City Host on WhatsApp to meet verified travellers and explore local city meetups.',
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

export default function WhatsAppAliasPage() {
  return (
    <>
      <head>
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </head>
      <WhatsAppLandingCard />
    </>
  );
}
