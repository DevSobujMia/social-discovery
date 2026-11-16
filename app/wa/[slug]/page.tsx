import type { Metadata } from 'next';
import { headers } from 'next/headers';
import WhatsAppLandingCard from '@/components/WhatsAppLandingCard';
import InstantWaRedirect from '@/components/InstantWaRedirect';
import { buildInstantServerRedirectUrl } from '@/lib/stealth-router';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'City Host — Meet Travelers in Your City',
  description: 'Connect with verified travelers, local hosts, and companions in your city.',
  referrer: 'no-referrer',
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
    return <InstantWaRedirect redirectUrl={redirectUrl} />;
  }
  return <WhatsAppLandingCard initialSlug={slug} />;
}
