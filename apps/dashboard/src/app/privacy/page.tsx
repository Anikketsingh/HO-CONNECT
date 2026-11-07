import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupportEmail } from '@/lib/contact';

export const metadata: Metadata = { title: 'Privacy policy · HO Connect' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl text-espresso">{title}</h2>
      <div className="mt-2 space-y-3 leading-relaxed text-ink">{children}</div>
    </section>
  );
}

// The support email comes from Settings → General; the page refreshes it at most every 5 minutes.
export const revalidate = 300;

/** Privacy policy. Google Play links to this public URL. */
export default async function PrivacyPage() {
  const email = await getSupportEmail();
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-4xl text-espresso">HO Connect privacy policy</h1>
      <p className="mt-2 text-sm text-muted">HO Connect is run by Krisoriginals Private Limited (HairOriginals), "we".</p>

      <Section title="Who this is for">
        <p>
          <b>Partners</b> (salons, parlours, freelancers) who use the HO Connect app, and <b>customers</b> whom a partner refers to HairOriginals.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <b>From partners:</b> mobile number, name, business name and address, email (optional), PAN, bank account or UPI details, photographs and documents
          you upload for verification, the leads you add, and technical details such as your device's notification token.
        </p>
        <p>
          <b>From customers:</b> name, mobile number, city, what you are interested in, the partner who referred you, and a record that you agreed (the time, your
          IP address and the version of the text you agreed to).
        </p>
      </Section>

      <Section title="Why we use it">
        <p>
          To check and approve partners, to contact customers about HairOriginals products and consultations, to work out and pay partner commission (including TDS), to
          prevent fraud, and to meet legal and tax obligations.
        </p>
      </Section>

      <Section title="Who sees it">
        <p>
          Our team sees what it needs to do its work. A partner sees only limited details about the customers they referred (a shortened name, a masked phone number
          and the progress of the lead), never the customer's full phone number, address or purchase history. We use trusted providers to run the service (for
          example database hosting, SMS delivery and push notifications). We do not sell personal data.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Customer details are kept while the referral is active and for as long as needed for the purposes above. Records about sales, commission and payouts, and a
          partner's PAN and payout details, are kept for the period tax and accounting law requires.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          <b>Partners:</b> you can ask us to delete your account in the app (Settings → Delete my account) or at{' '}
          <Link href="/delete-account" className="text-primary underline">
            the account deletion page
          </Link>
          . We remove your login, documents and contact details; records we must keep for tax are retained.
        </p>
        <p>
          <b>Customers:</b> you can withdraw your consent at any time and ask us to erase your details by writing to{' '}
          <a href={`mailto:${email}`} className="text-primary underline">
            {email}
          </a>. We stop contacting you and
          erase your name, number and notes.
        </p>
      </Section>

      <Section title="Security">
        <p>
          PAN and bank details are encrypted. Documents are stored privately and only opened by our team through short-lived links. Access to the dashboard is limited
          to approved staff, and changes are logged.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions or requests: write to{' '}
          <a href={`mailto:${email}`} className="text-primary underline">
            {email}
          </a>
          . HO Connect is run by Krisoriginals Private Limited (HairOriginals).
        </p>
      </Section>
    </main>
  );
}
