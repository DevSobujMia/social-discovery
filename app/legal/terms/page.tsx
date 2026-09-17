import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-surface-950 text-white px-4 py-10">
      <article className="max-w-2xl mx-auto space-y-5 text-sm text-surface-300 leading-relaxed">
        <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold">City Host</p>
        <h1 className="text-2xl font-extrabold text-white">Terms of Service</h1>
        <p className="text-xs text-surface-500">Last updated 15 September 2026</p>

        <p>
          City Host helps people meet travellers and local guides visiting their city. It is a
          travel-companion and meetup service, not a dating site, not a marriage bureau, and not a
          sexual services marketplace.
        </p>

        <h2 id="safety" className="text-base font-bold text-white pt-2">Who can use it</h2>
        <p>
          You may not use the service to solicit sexual contact, escorting, financial arrangements
          between partners, or anything illegal in the country you are in. Report abuse from chat.
        </p>

        <h2 className="text-base font-bold text-white pt-2">Profiles and messaging</h2>
        <p>
          Profiles on City Host belong to real, consenting people. Some conversations are assisted
          by City Host staff so that travellers can be reached promptly. Staff never impersonate a
          person who does not exist. Report anything that looks fake or abusive from the chat.
        </p>

        <h2 className="text-base font-bold text-white pt-2">Your conduct</h2>
        <p>
          Do not harass, threaten, or share another person&apos;s private contact without consent.
          We may suspend accounts that break these rules.
        </p>

        <p>
          <Link href="/" className="text-brand-400 font-semibold hover:underline">
            Back to City Host
          </Link>
        </p>
      </article>
    </main>
  );
}
