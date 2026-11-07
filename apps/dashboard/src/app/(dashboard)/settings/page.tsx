'use client';

import { ACCEPTED_UPLOAD_TYPES, partnerTypeAdminListSchema, type PartnerTypeAdmin } from '@hoc/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { SettingsTabs } from '@/components/settings-tabs';
import { Alert, Button, Card, cx, Field, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, apiSend, errorMessage } from '@/lib/api';

type DocType = PartnerTypeAdmin['documents'][number];
type Mime = (typeof ACCEPTED_UPLOAD_TYPES)[number];

const MIME_LABEL: Record<Mime, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'application/pdf': 'PDF',
};

interface DocForm {
  name: string;
  description: string;
  required: boolean;
  maxFiles: number;
  acceptedMimeTypes: Mime[];
}

const emptyDoc: DocForm = { name: '', description: '', required: true, maxFiles: 1, acceptedMimeTypes: [...ACCEPTED_UPLOAD_TYPES] };

function DocTypeForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: DocForm;
  submitLabel: string;
  onSave: (v: DocForm) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(v);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-paper p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Document name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
        <Field
          label="Up to how many files"
          type="number"
          min={1}
          max={10}
          value={v.maxFiles}
          onChange={(e) => setV({ ...v, maxFiles: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
        />
      </div>
      <Field
        label="Help text for partners"
        value={v.description}
        onChange={(e) => setV({ ...v, description: e.target.value })}
        placeholder="e.g. Outside, with the name board visible"
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.required} onChange={(e) => setV({ ...v, required: e.target.checked })} />
          Required
        </label>
        <span className="text-muted">Accepts:</span>
        {ACCEPTED_UPLOAD_TYPES.map((m) => (
          <label key={m} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={v.acceptedMimeTypes.includes(m)}
              onChange={(e) =>
                setV({
                  ...v,
                  acceptedMimeTypes: e.target.checked
                    ? [...v.acceptedMimeTypes, m]
                    : v.acceptedMimeTypes.filter((x) => x !== m),
                })
              }
            />
            {MIME_LABEL[m]}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || v.name.trim().length < 2 || v.acceptedMimeTypes.length === 0}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TypeCard({
  type,
  canEdit,
  run,
}: {
  type: PartnerTypeAdmin;
  canEdit: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const toForm = (d: DocType): DocForm => ({
    name: d.name,
    description: d.description ?? '',
    required: d.required,
    maxFiles: d.maxFiles,
    acceptedMimeTypes: d.acceptedMimeTypes.filter((m): m is Mime => m in MIME_LABEL),
  });
  const body = (v: DocForm) => ({ ...v, name: v.name.trim(), description: v.description.trim() || null });

  return (
    <Card className={cx('p-5', !type.active && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl text-espresso">{type.name}</h2>
            {!type.active ? <Pill tone="bad">Hidden from the app</Pill> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {type.description ?? 'No description'} · {type.partnerCount} partner{type.partnerCount === 1 ? '' : 's'}
          </p>
        </div>
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              run(() => apiSend(`/v1/admin/partner-types/${type.id}`, { method: 'PATCH', json: { active: !type.active } }))
            }
          >
            {type.active ? 'Hide from the app' : 'Show in the app'}
          </Button>
        ) : null}
      </div>

      <ul className="mt-4 divide-y divide-line">
        {type.documents.map((d) =>
          editing === d.id ? (
            <li key={d.id} className="py-3">
              <DocTypeForm
                initial={toForm(d)}
                submitLabel="Save"
                onCancel={() => setEditing(null)}
                onSave={(v) =>
                  run(async () => {
                    await apiSend(`/v1/admin/document-types/${d.id}`, { method: 'PATCH', json: body(v) });
                    setEditing(null);
                  })
                }
              />
            </li>
          ) : (
            <li key={d.id} className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 py-3', !d.active && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {d.name}
                  {!d.active ? <span className="ml-2 text-xs text-muted">(not asked for)</span> : null}
                </p>
                {d.description ? <p className="text-xs text-muted">{d.description}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone={d.required ? 'wait' : 'neutral'}>{d.required ? 'Required' : 'Optional'}</Pill>
                {d.maxFiles > 1 ? <Pill>up to {d.maxFiles} files</Pill> : null}
                <span className="text-xs text-muted">
                  {d.acceptedMimeTypes.map((m) => MIME_LABEL[m as Mime] ?? m).join(' · ')}
                </span>
              </div>
              {canEdit ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(d.id)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      run(() => apiSend(`/v1/admin/document-types/${d.id}`, { method: 'PATCH', json: { active: !d.active } }))
                    }
                  >
                    {d.active ? 'Stop asking' : 'Ask again'}
                  </Button>
                </div>
              ) : null}
            </li>
          ),
        )}
        {type.documents.length === 0 ? <li className="py-3 text-sm text-muted">No documents on this checklist.</li> : null}
      </ul>

      {canEdit ? (
        editing === 'new' ? (
          <div className="mt-3">
            <DocTypeForm
              initial={emptyDoc}
              submitLabel="Add document"
              onCancel={() => setEditing(null)}
              onSave={(v) =>
                run(async () => {
                  await apiSend(`/v1/admin/partner-types/${type.id}/document-types`, { method: 'POST', json: body(v) });
                  setEditing(null);
                })
              }
            />
          </div>
        ) : (
          <Button className="mt-3" size="sm" variant="outline" onClick={() => setEditing('new')}>
            + Add a document
          </Button>
        )
      ) : null}
    </Card>
  );
}

export default function SettingsPage() {
  const { state } = useAuth();
  const canEdit = state.status === 'ready' && state.admin.role === 'admin';
  const [types, setTypes] = useState<PartnerTypeAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newType, setNewType] = useState({ name: '', description: '' });

  const load = useCallback(async () => {
    try {
      setTypes((await api('/v1/admin/partner-types', partnerTypeAdminListSchema)).items);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      await load();
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Partner types and checklists" />
      <div className="mt-6">
        <SettingsTabs />
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        Each partner type has its own document checklist. Changes apply to new uploads straight away; applications already
        approved are not affected.
      </p>

      <div className="mt-6 space-y-3">
        {!canEdit && state.status === 'ready' ? <Alert tone="info">Only admins can change these settings.</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
      </div>

      {canEdit ? (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold text-espresso">Add a partner type</h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await apiSend('/v1/admin/partner-types', {
                  method: 'POST',
                  json: { name: newType.name.trim(), description: newType.description.trim() || null },
                });
                setNewType({ name: '', description: '' });
              });
            }}
          >
            <Field label="Name" value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })} placeholder="e.g. Spa" />
            <Field
              label="Description"
              value={newType.description}
              onChange={(e) => setNewType({ ...newType, description: e.target.value })}
              placeholder="Shown to partners when they register"
            />
            <Button type="submit" disabled={newType.name.trim().length < 2}>
              Add
            </Button>
          </form>
        </Card>
      ) : null}

      <div className="mt-6 space-y-6">
        {!types && !error ? <Spinner /> : null}
        {types?.map((t) => <TypeCard key={t.id} type={t} canEdit={canEdit} run={run} />)}
      </div>
    </div>
  );
}
