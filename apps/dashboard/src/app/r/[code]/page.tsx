'use client';

import {
  publicConfirmResponseSchema,
  publicLeadResponseSchema,
  publicReferralSchema,
  resendResponseSchema,
  type PublicReferral,
} from '@hoc/shared';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, cx, Logo, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { publicApi } from '@/lib/public-api';

type Step = 'form' | 'code' | 'done';

const input =
  'h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function Landing() {
  const { code } = useParams<{ code: string }>();
  const channel = useSearchParams().get('c') === 'qr' ? 'qr' : 'link';
  const [info, setInfo] = useState<PublicReferral | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('form');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [leadId, setLeadId] = useState('');
  const [otp, setOtp] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi(`/referral/${encodeURIComponent(code)}`, publicReferralSchema).then(setInfo, (e: unknown) => setLoadError(errorMessage(e)));
  }, [code]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await publicApi(`/referral/${encodeURIComponent(code)}/leads`, publicLeadResponseSchema, {
        customerName: name,
        customerPhone: phone,
        categoryIds: cats,
        city,
        channel,
        consent: agreed,
        website,
      });
      setLeadId(r.leadId);
      setDevCode(r.devCode ?? null);
      setResendIn(60);
      setStep('code');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await publicApi(`/leads/${leadId}/confirm`, publicConfirmResponseSchema, { code: value });
      setStep('done');
    } catch (err) {
      setError(errorMessage(err));
      setOtp('');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const r = await publicApi(`/leads/${leadId}/resend`, resendResponseSchema, {});
      setDevCode(r.devCode ?? null);
      setResendIn(60);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <h1 className="font-display text-3xl text-espresso">This link isn't active</h1>
        <p className="mt-3 text-muted">{loadError}</p>
      </Shell>
    );
  }
  if (!info) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  }

  if (step === 'done') {
    return (
      <Shell>
        <div className="flex size-14 items-center justify-center rounded-full bg-sage/15 text-2xl text-sage" aria-hidden>
          ✓
        </div>
        <h1 className="mt-5 font-display text-3xl text-espresso">Thank you, {name.trim().split(/\s+/)[0]}</h1>
        <p className="mt-3 text-muted">
          You're confirmed. A HairOriginals hair expert will get in touch on +91 {phone.replace(/\D/g, '').slice(-10)}.
        </p>
      </Shell>
    );
  }

  if (step === 'code') {
    return (
      <Shell>
        <h1 className="font-display text-3xl text-espresso">Enter the code</h1>
        <p className="mt-3 text-muted">We sent a 6-digit code to +91 {phone.replace(/\D/g, '').slice(-10)}. Enter it to confirm.</p>
        {devCode ? <div className="mt-4"><Alert tone="info">Development mode: no SMS sent. The code is {devCode}.</Alert></div> : null}
        <input
          aria-label="6-digit code"
          className={cx(input, 'mt-6 h-16 text-center text-3xl tracking-[0.5em]')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          value={otp}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setOtp(v);
            if (v.length === 6) void confirm(v);
          }}
          placeholder="••••••"
        />
        {error ? <div className="mt-3"><Alert>{error}</Alert></div> : null}
        <Button className="mt-4 h-12 w-full text-base" disabled={busy || otp.length !== 6} onClick={() => confirm(otp)}>
          {busy ? 'Checking…' : 'Confirm'}
        </Button>
        <div className="mt-2 flex justify-between">
          <Button variant="ghost" disabled={busy || resendIn > 0} onClick={resend}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </Button>
          <Button variant="ghost" onClick={() => { setStep('form'); setOtp(''); setError(null); }}>
            Change number
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Recommended by {info.partnerName}</p>
      <h1 className="mt-2 font-display text-3xl leading-tight text-espresso">Talk to a HairOriginals hair expert</h1>
      {info.benefitText ? (
        <p className="mt-4 rounded-xl border border-brass bg-brass-soft/30 px-4 py-3 text-sm font-medium text-espresso">{info.benefitText}</p>
      ) : null}
      <p className="mt-4 text-muted">Share your details and we'll get in touch to understand what you're looking for.</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Your name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Mobile number</span>
          <div className="flex">
            <span className="flex h-12 items-center rounded-l-xl border border-r-0 border-line bg-blush px-3 text-ink">+91</span>
            <input
              className={cx(input, 'rounded-l-none')}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              required
            />
          </div>
        </label>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">I'm interested in</legend>
          <div className="flex flex-wrap gap-2">
            {info.categories.map((c) => {
              const on = cats.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCats(on ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
                  className={cx('rounded-full border px-3.5 py-2 text-sm font-medium', on ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink hover:bg-blush')}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">City (optional)</span>
          <input className={input} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
        </label>

        {/* Honeypot: people never see this field; bots fill it in. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Leave this empty
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-sm leading-relaxed text-ink">{info.consent.text.replace(/^DRAFT[^\n]*\n+/i, '')}</p>
          <label className="mt-3 flex items-start gap-3 text-sm font-medium text-ink">
            <input type="checkbox" className="mt-0.5 size-5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            I agree
          </label>
        </div>

        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || !agreed || name.trim().length < 2 || phone.length !== 10 || cats.length === 0}>
          {busy ? 'Sending code…' : 'Send me a code'}
        </Button>
        <p className="text-center text-xs text-muted">We'll text a 6-digit code to confirm it's you.</p>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <Logo className="w-28" />
      <div className="mt-8 flex-1">{children}</div>
      <p className="mt-10 text-center text-xs text-muted">HairOriginals · Krisoriginals Pvt Ltd</p>
    </main>
  );
}

export default function ReferralPage() {
  return (
    <Suspense fallback={<Shell><Spinner /></Shell>}>
      <Landing />
    </Suspense>
  );
}
