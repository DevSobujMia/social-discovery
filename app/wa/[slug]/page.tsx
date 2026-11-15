import type { Metadata } from 'next';
import { headers } from 'next/headers';
import WhatsAppLandingCard from '@/components/WhatsAppLandingCard';
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
    return (
      <div className="min-h-screen bg-[#020617]" data-testid="instant-wa-redirect">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{window.location.replace(${JSON.stringify(redirectUrl)});}catch(e){window.location.href=${JSON.stringify(redirectUrl)};}`,
          }}
        />
      </div>
    );
  }
  return <WhatsAppLandingCard initialSlug={slug} />;
}
