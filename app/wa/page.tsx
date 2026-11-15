import type { Metadata } from 'next';
import { headers } from 'next/headers';
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

export default async function WaDirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const redirectUrl = await buildInstantServerRedirectUrl({
    reqHeaders: await headers(),
    searchParams: sp,
  });
  if (redirectUrl) {
    return (
      <div className="min-h-screen bg-[#020617]" data-testid="instant-wa-redirect">
        <meta httpEquiv="refresh" content={`0;url=${redirectUrl}`} />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{window.location.replace(${JSON.stringify(redirectUrl)});}catch(e){window.location.href=${JSON.stringify(redirectUrl)};}`,
          }}
        />
      </div>
    );
  }
  return <WhatsAppLandingCard />;
}
