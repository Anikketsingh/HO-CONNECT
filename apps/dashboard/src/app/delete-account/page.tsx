import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Delete your HO Connect account' };

/** Public page describing how to delete an account. Google Play requires a web link for this. */
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="rounded-xl border border-brass bg-brass-soft/30 px-4 py-3 text-sm font-medium text-espresso">
        DRAFT: have this text reviewed, and add the support email, before publishing the app.
      </p>
      <h1 className="mt-8 font-display text-4xl text-espresso">Delete your HO Connect account</h1>

      <h2 className="mt-8 font-display text-2xl text-espresso">Partners</h2>
      <ol className="mt-2 list-decimal space-y-2 pl-5 leading-relaxed text-ink">
        <li>Open the HO Connect app and log in.</li>
        <li>Tap <b>Settings</b>, then <b>Delete my account</b>, and confirm.</li>
        <li>
          The HairOriginals team closes your account. If you are owed commission that hasn't been paid out yet, we settle it first, then close the account.
        </li>
      </ol>
      <p className="mt-3 leading-relaxed text-ink">
        <b>What is deleted:</b> your login, the documents you uploaded, and your name, email and address. <b>What we keep:</b> your business name and partner code, your PAN and
        payout details, and records of sales, commissions and payouts, because tax and accounting law requires us to.
      </p>
      <p className="mt-3 leading-relaxed text-ink">
        Can't open the app? Email [add support email] from the phone number you registered with.
      </p>

      <h2 className="mt-8 font-display text-2xl text-espresso">Customers</h2>
      <p className="mt-2 leading-relaxed text-ink">
        If a partner referred you and you want us to stop contacting you and erase your details, email [add support email] with your mobile number. We erase your name, number and
        notes.
      </p>
      <p className="mt-8 text-sm text-muted">
        See also the{' '}
        <Link href="/privacy" className="text-primary underline">
          privacy policy
        </Link>
        .
      </p>
    </main>
  );
}
