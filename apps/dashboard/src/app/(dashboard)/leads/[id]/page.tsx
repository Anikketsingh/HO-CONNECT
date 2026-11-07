'use client';

import {
  adminLeadDetailSchema,
  CONSULTATION_MODE_LABELS,
  OPEN_PIPELINE_STAGES,
  PREFERRED_MODE_LABELS,
  stageChangeResultSchema,
  type AdminLeadDetail,
  type CustomerType,
} from '@hoc/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { emptyStageForm, StageFields, stageFormReady, StagePill, type StageForm } from '@/components/lead-ui';
import { SalesCard } from '@/components/record-sale';
import { Alert, Button, Card, Pill, Spinner, TextArea } from '@/components/ui';
import { api, apiSend, errorMessage } from '@/lib/api';
import {
  CUSTOMER_TYPE_LABELS,
  formatDate,
  formatDateTime,
  formatPhone,
  leadEventLabel,
  localToIso,
  STAGE_LABELS,
  timeAgo,
} from '@/lib/format';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children ?? '—'}</dd>
    </div>
  );
}

const TAGS: { type: CustomerType; label: string; hint: string; variant: 'success' | 'outline' | 'danger' }[] = [
  { type: 'new', label: 'New customer', hint: 'Not in DigiCuro', variant: 'success' },
  { type: 'existing_contact', label: 'Existing contact', hint: 'In DigiCuro, never bought', variant: 'outline' },
  { type: 'existing_customer', label: 'Existing customer', hint: 'Has bought before', variant: 'outline' },
  { type: 'invalid', label: 'Invalid', hint: 'Wrong number, test or spam', variant: 'danger' },
];

function VerifyPanel({ lead, onDone }: { lead: AdminLeadDetail; onDone: (fn: () => Promise<void>, msg: string) => Promise<void> }) {
  const [crmRef, setCrmRef] = useState(lead.crmRef ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<CustomerType | null>(null);

  async function tag(type: CustomerType) {
    setBusy(type);
    await onDone(
      () => apiSend(`/v1/admin/leads/${lead.id}/verify`, { method: 'POST', json: { customerType: type, crmRef, note: note || undefined } }),
      `Tagged as ${CUSTOMER_TYPE_LABELS[type]}.`,
    );
    setBusy(null);
  }

  return (
    <Card className="border-brass p-5">
      <h2 className="font-semibold text-espresso">Verify</h2>
      <p className="mt-1 text-sm text-muted">
        Look up <span className="font-semibold text-ink tabular-nums">{formatPhone(lead.customerPhone)}</span> in DigiCuro,
        then tag the customer. Partners see "New customer for HO" or, for both existing types, "Already connected with HO".
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          DigiCuro reference (optional)
          <input
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-primary focus:outline-none"
            value={crmRef}
            onChange={(e) => setCrmRef(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Internal note (optional)
          <input
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-primary focus:outline-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {TAGS.map((t) => (
          <Button key={t.type} variant={t.variant} disabled={busy !== null} onClick={() => tag(t.type)} className="h-auto flex-col py-2">
            <span>{busy === t.type ? 'Saving…' : t.label}</span>
            <span className="text-[11px] font-normal opacity-80">{t.hint}</span>
          </Button>
        ))}
      </div>
    </Card>
  );
}

function WithdrawConsent({ leadId, onDone }: { leadId: string; onDone: (msg: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/v1/admin/leads/${leadId}/withdraw-consent`, { method: 'POST', json: { note: note.trim() } });
      await onDone("Consent withdrawn. The customer's name, phone and notes were erased.");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Card className="p-5">
      <h2 className="font-semibold text-espresso">Customer asked us to stop?</h2>
      <p className="mt-1 text-sm text-muted">
        Closes the lead and erases the customer's name, phone, city and notes. Any sale and commission stay on record, without a person attached. This can't be undone.
      </p>
      {error ? <div className="mt-3"><Alert>{error}</Alert></div> : null}
      {open ? (
        <div className="mt-3 space-y-2">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How did they ask? (e.g. called on 12 Nov)" />
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy || note.trim().length < 5} onClick={go}>
              {busy ? 'Erasing…' : 'Withdraw consent and erase'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3" size="sm" variant="danger" onClick={() => setOpen(true)}>
          Withdraw consent…
        </Button>
      )}
    </Card>
  );
}

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<AdminLeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stage, setStage] = useState<StageForm>(emptyStageForm);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setLead(await api(`/v1/admin/leads/${id}`, adminLeadDetailSchema));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<void>, done: string) {
    setActionError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      await load();
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/leads" className="text-sm font-medium text-primary">
          ← Leads
        </Link>
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!lead) return <Spinner />;

  const inPipeline = (OPEN_PIPELINE_STAGES as readonly string[]).includes(lead.stage);

  return (
    <div>
      <Link href={lead.stage === 'under_review' ? '/leads' : '/leads?view=all'} className="text-sm font-medium text-primary hover:text-primary-deep">
        ← Leads
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl text-espresso">{lead.customerName}</h1>
        <StagePill stage={lead.stage} />
        {lead.customerType ? <Pill>{CUSTOMER_TYPE_LABELS[lead.customerType]}</Pill> : null}
      </div>
      <p className="mt-1 text-sm text-muted">
        {lead.ref} · referred by{' '}
        <Link href={`/partners/${lead.partner.id}`} className="font-medium text-primary">
          {lead.partner.name}
        </Link>{' '}
        {timeAgo(lead.createdAt)}
      </p>

      <div className="mt-6 space-y-3">
        {actionError ? <Alert>{actionError}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        {lead.duplicateOf ? (
          <Alert tone="info">
            Another partner already owns this customer:{' '}
            <Link href={`/leads/${lead.duplicateOf.id}`} className="font-semibold underline">
              {lead.duplicateOf.ref}
            </Link>
          </Alert>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {lead.stage === 'under_review' ? <VerifyPanel lead={lead} onDone={act} /> : null}

          {inPipeline ? (
            <Card className="p-5">
              <h2 className="font-semibold text-espresso">Update stage</h2>
              {lead.consultation ? (
                <p className="mt-1 text-sm text-muted">
                  Consultation: {CONSULTATION_MODE_LABELS[lead.consultation.mode]}
                  {lead.consultation.at ? `, ${formatDateTime(lead.consultation.at)}` : ''}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <StageFields value={stage} onChange={setStage} />
                <Button
                  disabled={!stageFormReady(stage)}
                  onClick={() =>
                    act(async () => {
                      await api(`/v1/admin/leads/${lead.id}/stage`, stageChangeResultSchema, {
                        method: 'POST',
                        json: {
                          stage: stage.stage,
                          consultationMode: stage.consultationMode || null,
                          consultationAt: localToIso(stage.consultationAt),
                          note: stage.note || undefined,
                        },
                      });
                      setStage(emptyStageForm);
                    }, 'Stage updated. The partner sees the new stage in the app.')
                  }
                >
                  Save
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted">
                "Purchased" is set by recording a sale below.
              </p>
            </Card>
          ) : lead.stage !== 'under_review' ? (
            <Card className="p-5">
              <p className="text-sm text-muted">
                {lead.stage === 'awaiting_consent'
                  ? 'Waiting for the customer to confirm by OTP. Leads can be worked only after consent.'
                  : `This lead is "${STAGE_LABELS[lead.stage]}" and can't be moved by hand.`}
              </p>
            </Card>
          ) : null}

          {lead.sales.length || ((inPipeline || lead.stage === 'purchased') && lead.customerType && lead.customerType !== 'invalid') ? (
            <SalesCard
              lead={lead}
              canRecord={(inPipeline || lead.stage === 'purchased') && !!lead.customerType && lead.customerType !== 'invalid'}
              onRecorded={async (msg) => {
                setNotice(msg);
                await load();
              }}
            />
          ) : null}

          {lead.consentStatus !== 'withdrawn' ? (
            <WithdrawConsent
              leadId={lead.id}
              onDone={async (m) => {
                setNotice(m);
                await load();
              }}
            />
          ) : (
            <Alert tone="info">The customer withdrew consent and their details were erased.</Alert>
          )}

          <Card className="p-5">
            <h2 className="font-semibold text-espresso">Add an internal note</h2>
            <TextArea className="mt-3" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Partners never see notes." />
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              disabled={!note.trim()}
              onClick={() =>
                act(async () => {
                  await apiSend(`/v1/admin/leads/${lead.id}/notes`, { method: 'POST', json: { note: note.trim() } });
                  setNote('');
                }, 'Note added.')
              }
            >
              Add note
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-espresso">Timeline</h2>
            <ol className="mt-3 space-y-3">
              {lead.events.map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/50" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-ink">
                      <span className="font-medium">{e.actor}</span> · {leadEventLabel(e.type)}
                      {e.type === 'verified' && e.meta?.customerType ? `: ${CUSTOMER_TYPE_LABELS[String(e.meta.customerType)]}` : ''}
                      {e.type === 'stage_changed' && e.toStage ? `: ${STAGE_LABELS[e.toStage]}` : ''}
                      {e.meta?.source === 'bulk_csv' ? ' (CSV)' : e.meta?.source === 'bulk_selection' ? ' (bulk)' : ''}
                    </p>
                    {e.note ? <p className="text-muted">{e.note}</p> : null}
                    <p className="text-xs text-muted">
                      {formatDateTime(e.at)} · {e.visibleToPartner ? 'Partner sees this' : 'Internal'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-espresso">Customer</h2>
            <dl className="mt-2 divide-y divide-line/60">
              <Row label="Mobile">
                <a href={`tel:+91${lead.customerPhone}`} className="text-primary tabular-nums">
                  +91 {formatPhone(lead.customerPhone)}
                </a>
              </Row>
              <Row label="City">{[lead.city, lead.pincode].filter(Boolean).join(' · ') || null}</Row>
              <Row label="Interested in">{lead.interests.join(', ') || null}</Row>
              <Row label="Prefers">
                {PREFERRED_MODE_LABELS[lead.preferredMode]}
                {lead.preferredCentre ? ` · ${lead.preferredCentre}` : ''}
              </Row>
              <Row label="Partner's note">{lead.notes}</Row>
              <Row label="DigiCuro ref">{lead.crmRef}</Row>
              <Row label="Benefit">{lead.benefit ? lead.benefit.customerText : 'None'}</Row>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-espresso">Consent and ownership</h2>
            <dl className="mt-2 divide-y divide-line/60">
              <Row label="Consent">{lead.consentStatus === 'not_required' ? 'Not required (switched off)' : lead.consentStatus}</Row>
              <Row label="Confirmed">{formatDateTime(lead.consentConfirmedAt)}</Row>
              <Row label="Owned until">{lead.ownedUntil ? formatDate(lead.ownedUntil) : null}</Row>
              <Row label="Verified">{lead.verifiedBy ? `${lead.verifiedBy}, ${formatDateTime(lead.verifiedAt)}` : null}</Row>
            </dl>
            {lead.consents.length ? (
              <ul className="mt-3 space-y-2 border-t border-line pt-3 text-xs text-muted">
                {lead.consents.map((c, i) => (
                  <li key={i}>
                    Code sent {formatDateTime(c.sentAt)} · text v{c.textVersion} · {c.attempts} attempt{c.attempts === 1 ? '' : 's'}
                    {c.verifiedAt ? ` · confirmed ${formatDateTime(c.verifiedAt)}${c.ip ? ` from ${c.ip}` : ''}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {lead.samePhone.length ? (
            <Card className="p-5">
              <h2 className="font-semibold text-espresso">Same phone, other leads</h2>
              <ul className="mt-2 divide-y divide-line/60 text-sm">
                {lead.samePhone.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/leads/${s.id}`} className="text-primary">
                      {s.ref}
                    </Link>
                    <span className="truncate text-muted">{s.partner}</span>
                    <StagePill stage={s.stage} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
