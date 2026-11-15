import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import WhatsAppLandingCard from '@/components/WhatsAppLandingCard';
import { buildInstantServerRedirectUrl } from '@/lib/stealth-router';

export const dynamic = 'force-dynamic';

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

export default async function WaSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const redirectUrl = await buildInstantServerRedirectUrl({
    reqHeaders: await headers(),
    slug,
    searchParams: sp,
  });
  if (redirectUrl) {
    redirect(redirectUrl);
  }
  return <WhatsAppLandingCard initialSlug={slug} />;
}
