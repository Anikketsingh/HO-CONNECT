'use client';

import {
  adminPartnerDetailSchema,
  partnerSensitiveSchema,
  type AdminPartnerDetail,
  type PartnerDecision,
  type PartnerSensitive,
} from '@hoc/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { PartnerPlanCard } from '@/components/partner-plan';
import { ReferralQrCard } from '@/components/referral-qr';
import { Alert, Button, Card, Pill, Spinner, StatusPill, TextArea } from '@/components/ui';
import { api, apiSend, errorMessage } from '@/lib/api';
import { actionLabel, formatBytes, formatDate, formatDateTime, formatPhone, timeAgo } from '@/lib/format';

type Doc = AdminPartnerDetail['checklist'][number]['documents'][number];
type Sensitive = PartnerSensitive;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children ?? '—'}</dd>
    </div>
  );
}

function DocumentItem({
  doc,
  reviewable,
  onReview,
}: {
  doc: Doc;
  reviewable: boolean;
  onReview: (status: 'accepted' | 'rejected', note?: string) => Promise<void>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const isImage = doc.mimeType.startsWith('image/');

  async function review(status: 'accepted' | 'rejected') {
    setBusy(true);
    try {
      await onReview(status, status === 'rejected' ? note.trim() : undefined);
      setRejecting(false);
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex gap-4 py-3">
      <a
        href={doc.viewUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper"
        aria-label={`Open ${doc.fileName}`}
      >
        {isImage && doc.viewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.viewUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-xs font-bold text-primary">PDF</span>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={doc.viewUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm font-medium text-ink hover:text-primary"
          >
            {doc.fileName}
          </a>
          <Pill tone={doc.status === 'accepted' ? 'good' : doc.status === 'rejected' ? 'bad' : 'wait'}>
            {doc.status === 'pending' ? 'To review' : doc.status === 'accepted' ? 'Accepted' : 'Rejected'}
          </Pill>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {formatBytes(doc.sizeBytes)} · uploaded {timeAgo(doc.createdAt)}
        </p>
        {doc.reviewerNote ? <p className="mt-1 text-xs text-danger">Note to partner: {doc.reviewerNote}</p> : null}

        {reviewable ? (
          rejecting ? (
            <div className="mt-2 space-y-2">
              <TextArea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What should the partner fix? They will see this."
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" disabled={busy || note.trim().length < 3} onClick={() => review('rejected')}>
                  Reject document
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              {doc.status !== 'accepted' ? (
                <Button size="sm" variant="success" disabled={busy} onClick={() => review('accepted')}>
                  Accept
                </Button>
              ) : null}
              {doc.status !== 'rejected' ? (
                <Button size="sm" variant="danger" disabled={busy} onClick={() => setRejecting(true)}>
                  Reject
                </Button>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </li>
  );
}

function CloseAccountCard({ partnerId, onDone }: { partnerId: string; onDone: (msg: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function close() {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/v1/admin/partners/${partnerId}/close-account`, { method: 'POST', json: { note: note.trim() } });
      await onDone('Account closed.');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Card className="border-danger/30 p-5">
      <h2 className="font-semibold text-espresso">Close account</h2>
      <p className="mt-1 text-sm text-muted">
        Turns off their login, deletes uploaded documents and removes their name, email and address. Sales, commissions, payouts, PAN and payout
        details are kept, because tax law requires it. This can't be undone.
      </p>
      {error ? <div className="mt-3"><Alert>{error}</Alert></div> : null}
      {open ? (
        <div className="mt-3 space-y-2">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the audit log (e.g. requested in the app on …)" />
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy || note.trim().length < 5} onClick={close}>
              {busy ? 'Closing…' : 'Close this account'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3" variant="danger" onClick={() => setOpen(true)}>
          Close account…
        </Button>
      )}
    </Card>
  );
}

function DecisionPanel({
  partner,
  isAdmin,
  onDecide,
}: {
  partner: AdminPartnerDetail;
  isAdmin: boolean;
  onDecide: (action: PartnerDecision, note?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<PartnerDecision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const needsNote = mode !== null && mode !== 'approve' && mode !== 'reactivate';

  async function confirm() {
    if (!mode) return;
    setBusy(true);
    try {
      await onDecide(mode, needsNote ? note.trim() : undefined);
      setMode(null);
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  const available: { action: PartnerDecision; label: string; variant: 'success' | 'outline' | 'danger' }[] = [];
  if (partner.status === 'submitted') {
    available.push(
      { action: 'approve', label: 'Approve', variant: 'success' },
      { action: 'request_changes', label: 'Ask for changes', variant: 'outline' },
      { action: 'reject', label: 'Reject', variant: 'danger' },
    );
  } else if (partner.status === 'changes_requested') {
    available.push({ action: 'reject', label: 'Reject', variant: 'danger' });
  } else if (partner.status === 'approved' && isAdmin) {
    available.push({ action: 'suspend', label: 'Suspend partner', variant: 'danger' });
  } else if (partner.status === 'suspended' && isAdmin) {
    available.push({ action: 'reactivate', label: 'Reactivate partner', variant: 'success' });
  }

  const blocked = partner.approvalBlockers.length > 0;
  const confirmText: Record<PartnerDecision, string> = {
    approve: 'Approve and issue a partner code?',
    request_changes: 'Send back to the partner with this note:',
    reject: 'Reject this application? The partner will see this note:',
    suspend: 'Suspend this partner? They will see this note:',
    reactivate: 'Reactivate this partner?',
  };

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-espresso">Decision</h2>
      {partner.status === 'submitted' && blocked ? (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {partner.approvalBlockers.map((b) => (
            <li key={b.key}>• {b.message}</li>
          ))}
        </ul>
      ) : null}
      {partner.status === 'changes_requested' ? (
        <p className="mt-2 text-sm text-muted">Waiting for the partner to update and resubmit.</p>
      ) : null}
      {partner.status === 'draft' ? (
        <p className="mt-2 text-sm text-muted">The partner hasn't submitted yet.</p>
      ) : null}
      {partner.status === 'approved' && !isAdmin ? (
        <p className="mt-2 text-sm text-muted">Approved. Only admins can suspend partners.</p>
      ) : null}
      {partner.status === 'rejected' ? <p className="mt-2 text-sm text-muted">This application was rejected.</p> : null}

      {mode ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-ink">{confirmText[mode]}</p>
          {needsNote ? (
            <TextArea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Be specific: the partner will read this in the app."
              autoFocus
            />
          ) : null}
          <div className="flex gap-2">
            <Button
              variant={mode === 'approve' || mode === 'reactivate' ? 'success' : mode === 'request_changes' ? 'primary' : 'danger'}
              disabled={busy || (needsNote && note.trim().length < 5)}
              onClick={confirm}
            >
              {busy ? 'Saving…' : 'Confirm'}
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : available.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {available.map((a) => (
            <Button
              key={a.action}
              variant={a.variant}
              disabled={a.action === 'approve' && blocked}
              title={a.action === 'approve' && blocked ? 'Accept every required document first' : undefined}
              onClick={() => setMode(a.action)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export default function PartnerReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useAuth();
  const isAdmin = state.status === 'ready' && state.admin.role === 'admin';

  const [partner, setPartner] = useState<AdminPartnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sensitive, setSensitive] = useState<Sensitive | null>(null);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(true);

  const load = useCallback(async () => {
    try {
      const p = await api(`/v1/admin/partners/${id}`, adminPartnerDetailSchema);
      setPartner(p);
      setNotes(p.internalNotes ?? '');
      setNotesSaved(true);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<void>, done?: string) {
    setActionError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      await load();
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/partners" className="text-sm font-medium text-primary">
          ← Partners
        </Link>
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!partner) return <Spinner />;

  const reviewable = partner.status === 'submitted';

  return (
    <div>
      <Link href="/partners" className="text-sm font-medium text-primary hover:text-primary-deep">
        ← Partners
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl text-espresso">{partner.businessName ?? 'Unnamed partner'}</h1>
        <StatusPill status={partner.status} />
        {partner.code ? (
          <span className="rounded-md bg-espresso px-2 py-1 font-mono text-xs font-semibold tracking-wider text-white">
            {partner.code}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">
        {partner.partnerType.name} · {partner.city ?? 'No city'} ·{' '}
        {partner.submittedAt ? `submitted ${timeAgo(partner.submittedAt)}` : `started ${timeAgo(partner.createdAt)}`}
      </p>

      <div className="mt-6 space-y-3">
        {actionError ? <Alert>{actionError}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        {partner.closedAt ? (
          <Alert tone="info">This account was closed on {formatDate(partner.closedAt)}. Documents and contact details were removed; business name, PAN, payout details, sales and commissions are kept for tax and audit.</Alert>
        ) : partner.deletionRequestedAt ? (
          <Alert tone="info">
            <span className="font-semibold">This partner asked to delete their account on {formatDate(partner.deletionRequestedAt)}.</span>{' '}
            {isAdmin ? 'Pay out or close any commission they are owed, then close the account below.' : 'An admin will close it.'}
          </Alert>
        ) : null}
        {partner.reviewNote ? (
          <Alert tone="info">
            <span className="font-semibold">Note sent to the partner:</span> {partner.reviewNote}
          </Alert>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-espresso">Documents</h2>
              {!reviewable ? <span className="text-xs text-muted">Review opens when the partner submits</span> : null}
            </div>
            <div className="mt-2 divide-y divide-line">
              {partner.checklist.map(({ documentType: dt, documents }) => (
                <section key={dt.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{dt.name}</h3>
                    <Pill>{dt.required ? 'Required' : 'Optional'}</Pill>
                    {dt.maxFiles > 1 ? <span className="text-xs text-muted">up to {dt.maxFiles} files</span> : null}
                  </div>
                  {dt.description ? <p className="mt-0.5 text-xs text-muted">{dt.description}</p> : null}
                  {documents.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">{dt.required ? 'Not uploaded yet.' : 'Not provided.'}</p>
                  ) : (
                    <ul className="divide-y divide-line/60">
                      {documents.map((doc) => (
                        <DocumentItem
                          key={doc.id}
                          doc={doc}
                          reviewable={reviewable}
                          onReview={(status, note) =>
                            act(() =>
                              apiSend(`/v1/admin/partners/${partner.id}/documents/${doc.id}`, {
                                method: 'PATCH',
                                json: { status, note },
                              }),
                            )
                          }
                        />
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-espresso">Activity</h2>
            {partner.history.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No activity yet.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {partner.history.map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/50" aria-hidden />
                    <div>
                      <p className="text-ink">
                        <span className="font-medium">{h.actor}</span> · {actionLabel(h.action)}
                      </p>
                      {h.reason ? <p className="text-muted">{h.reason}</p> : null}
                      <p className="text-xs text-muted">{formatDateTime(h.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <DecisionPanel
            partner={partner}
            isAdmin={isAdmin}
            onDecide={(action, note) =>
              act(
                () => apiSend(`/v1/admin/partners/${partner.id}/decision`, { method: 'POST', json: { action, note } }),
                action === 'approve' ? 'Approved. The partner can now see their partner code in the app.' : 'Saved.',
              )
            }
          />

          {partner.status === 'approved' || partner.status === 'suspended' ? <PartnerPlanCard partnerId={partner.id} isAdmin={isAdmin} /> : null}

          {partner.code ? <ReferralQrCard key={partner.code} partnerId={partner.id} /> : null}

          <Card className="p-5">
            <h2 className="font-semibold text-espresso">Details</h2>
            <dl className="mt-2 divide-y divide-line/60">
              <Row label="Owner">{partner.ownerName}</Row>
              <Row label="Mobile">
                <a href={`tel:+91${partner.phone}`} className="text-primary">
                  +91 {formatPhone(partner.phone)}
                </a>
              </Row>
              <Row label="Email">{partner.email}</Row>
              <Row label="Address">
                {[partner.addressLine, partner.city, partner.state, partner.pincode].filter(Boolean).join(', ') || null}
              </Row>
              <Row label="Nearest EC">{partner.homeCentre ? `${partner.homeCentre.name}, ${partner.homeCentre.city}` : null}</Row>
              <Row label="Terms">
                {partner.agreementVersion
                  ? `Accepted v${partner.agreementVersion} on ${formatDate(partner.agreementAcceptedAt)}`
                  : 'Not accepted yet'}
              </Row>
            </dl>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-espresso">Tax and payout</h2>
              {!sensitive && (partner.panLast4 || partner.payoutDisplay) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    act(async () => setSensitive(await api(`/v1/admin/partners/${partner.id}/sensitive`, partnerSensitiveSchema)))
                  }
                >
                  Show full details
                </Button>
              ) : null}
            </div>
            <dl className="mt-2 divide-y divide-line/60">
              <Row label="PAN">
                <span className="font-mono">{sensitive?.pan ?? (partner.panLast4 ? `••••••${partner.panLast4}` : null)}</span>
              </Row>
              <Row label="GSTIN">{partner.gstin ? <span className="font-mono">{partner.gstin}</span> : 'Not registered'}</Row>
              <Row label="Payout">
                {sensitive?.payout ? (
                  sensitive.payout.method === 'upi' ? (
                    <span className="font-mono">{sensitive.payout.upiId}</span>
                  ) : (
                    <span>
                      {sensitive.payout.accountHolder}
                      <br />
                      <span className="font-mono">
                        {sensitive.payout.accountNumber} · {sensitive.payout.ifsc}
                      </span>
                    </span>
                  )
                ) : (
                  partner.payoutDisplay
                )}
              </Row>
            </dl>
            {sensitive ? <p className="mt-2 text-xs text-muted">Viewing full details is recorded in the activity log.</p> : null}
          </Card>

          {partner.deletionRequestedAt && !partner.closedAt && isAdmin ? <CloseAccountCard partnerId={partner.id} onDone={(m) => act(async () => {}, m)} /> : null}

          <Card className="p-5">
            <h2 className="font-semibold text-espresso">Internal notes</h2>
            <p className="mt-1 text-xs text-muted">Only the HO team sees these.</p>
            <TextArea
              className="mt-3"
              rows={4}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesSaved(false);
              }}
              placeholder="Visited the salon on…, spoke to the owner…"
            />
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              disabled={notesSaved}
              onClick={() =>
                act(
                  () => apiSend(`/v1/admin/partners/${partner.id}/notes`, { method: 'PUT', json: { internalNotes: notes } }),
                  'Notes saved.',
                )
              }
            >
              {notesSaved ? 'Saved' : 'Save notes'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
