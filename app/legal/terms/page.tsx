import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-surface-950 text-white px-4 py-10">
      <article className="max-w-2xl mx-auto space-y-5 text-sm text-surface-300 leading-relaxed">
        <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold">Heartlink</p>
        <h1 className="text-2xl font-extrabold text-white">Terms of Service</h1>
        <p className="text-xs text-surface-500">Last updated 9 September 2026 · You must be 18 or older</p>

        <p>
          Heartlink helps people in the Gulf meet travellers who are visiting their city. It is a
          travel-companion and social introduction service, not a sexual services marketplace and
          not a marriage bureau.
        </p>

        <h2 className="text-base font-bold text-white pt-2">Who can use it</h2>
        <p>
          You must be at least 18. You may not use the service to solicit sexual contact, escorting,
          financial arrangements between partners, or anything illegal in the United Arab Emirates
          or Saudi Arabia.
        </p>

        <h2 className="text-base font-bold text-white pt-2">Profiles and messaging</h2>
        <p>
          Profiles on Heartlink belong to real, consenting people. Some conversations are assisted
          by Heartlink staff so that travellers can be reached promptly. Staff never impersonate a
          person who does not exist. Report anything that looks fake or abusive from the chat.
        </p>

        <h2 className="text-base font-bold text-white pt-2">Your conduct</h2>
        <p>
          Do not harass, threaten, or share another person&apos;s private contact without consent.
          We may suspend accounts that break these rules.
        </p>

        <p>
          <Link href="/" className="text-brand-400 font-semibold hover:underline">
            Back to Heartlink
          </Link>
        </p>
      </article>
    </main>
  );
}
