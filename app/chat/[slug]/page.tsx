import type { Metadata } from 'next';
import WhatsAppLandingCard from '@/components/WhatsAppLandingCard';

export const metadata: Metadata = {
  title: 'City Host — Meet Travelers in Your City',
  description: 'Connect with verified travelers, local hosts, and companions in your city.',
  referrer: 'no-referrer',
};

export default async function ChatSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <WhatsAppLandingCard initialSlug={slug} />;
}
