import type { Metadata } from 'next';
import WhatsAppLandingCard from '@/components/WhatsAppLandingCard';

export const metadata: Metadata = {
  title: 'WhatsApp Chat | City Host',
  description: 'Connect privately with City Host concierge on WhatsApp.',
  referrer: 'no-referrer',
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

export default async function ChatSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <WhatsAppLandingCard initialSlug={slug} />;
}
