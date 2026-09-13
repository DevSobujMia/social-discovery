import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-surface-950 text-white px-4 py-10">
      <article className="max-w-2xl mx-auto space-y-5 text-sm text-surface-300 leading-relaxed">
        <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold">Heartlink</p>
        <h1 className="text-2xl font-extrabold text-white">Privacy Policy</h1>
        <p className="text-xs text-surface-500">Last updated 9 September 2026 · 18+ only</p>

        <p>
          Heartlink is a travel-companion matching service. We collect the smallest amount of
          information needed to introduce you to a traveller visiting your city and to keep that
          conversation available if you close the tab.
        </p>

        <h2 className="text-base font-bold text-white pt-2">What we collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>First name, approximate age and the city you are in (from the ad you clicked or your device).</li>
          <li>Messages you send on this site.</li>
          <li>A contact channel you choose later — WhatsApp, Telegram or phone — so a reply can reach you.</li>
          <li>Technical data: a device token in your browser, ad campaign parameters, and approximate location from the network edge.</li>
        </ul>

        <h2 className="text-base font-bold text-white pt-2">How we use it</h2>
        <p>
          To match you with a traveller, to operate the on-site chat, to notify you of a reply on
          the channel you picked, and to measure which ads work. We do not sell your contact details.
        </p>

        <h2 className="text-base font-bold text-white pt-2">Your rights</h2>
        <p>
          You may ask us to delete your conversation and contact details at any time. Write to the
          support address on the site. We keep unverified visits for a limited period so a returning
          visitor can resume chat, then remove them.
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
