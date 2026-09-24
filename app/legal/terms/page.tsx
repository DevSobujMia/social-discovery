import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-surface-950 text-white px-4 py-10">
      <article className="max-w-2xl mx-auto space-y-5 text-sm text-surface-300 leading-relaxed">
        <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold">City Host</p>
        <h1 className="text-2xl font-extrabold text-white">Terms of Service</h1>
        <p className="text-xs text-surface-500">Last updated 18 September 2026</p>

        <p>
          City Host is a trip-sharing site. Travellers post an upcoming trip. People who live in
          that city can find the trip and send a message on this site. City Host is the name of
          the service.
        </p>

        <h2 id="safety" className="text-base font-bold text-white pt-2">Who can use it</h2>
        <p>
          You must be 18 or older. Do not use City Host to solicit sexual contact, escorting,
          paid arrangements, or anything illegal where you are. Report abuse from chat.
        </p>

        <h2 className="text-base font-bold text-white pt-2">Trips and messaging</h2>
        <p>
          Shared trips belong to real, consenting people. Some conversations are assisted by
          City Host staff so a traveller can be reached promptly. Staff never invent a person.
          Chat stays on City Host unless you choose a contact channel later.
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
