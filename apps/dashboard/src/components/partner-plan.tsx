'use client';

import { partnerPlanSchema, type PartnerPlan } from '@hoc/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { inputClass } from '@/components/settings-tabs';
import { Alert, Button, Card } from '@/components/ui';
import { api, apiSend, errorMessage } from '@/lib/api';

const VIA: Record<string, string> = {
  partner: 'set for this partner',
  partner_type: 'from their partner type',
  default: 'the default plan',
};

/** Which commission plan applies to a partner, and (for admins) a per-partner override. */
export function PartnerPlanCard({ partnerId, isAdmin }: { partnerId: string; isAdmin: boolean }) {
  const [data, setData] = useState<PartnerPlan | null>(null);
  const [choice, setChoice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api(`/v1/admin/partners/${partnerId}/plan`, partnerPlanSchema);
      setData(d);
      setChoice(d.overridePlanId ?? '');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [partnerId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiSend('/v1/admin/plan-assignments', { method: 'PUT', json: { scope: 'partner', scopeId: partnerId, planId: choice || null } });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-espresso">Commission plan</h2>
      {data ? (
        <p className="mt-1 text-sm text-ink">
          {data.effective ? (
            <>
              <span className="font-medium">{data.effective.name}</span>
              <span className="text-muted">, {VIA[data.effective.via]}</span>
            </>
          ) : (
            <span className="text-danger">No plan is in effect: sales would earn ₹0.</span>
          )}
        </p>
      ) : null}
      {error ? (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {isAdmin && data ? (
        <div className="mt-3 flex gap-2">
          <select aria-label="Plan for this partner" className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">No override (use partner type or default)</option>
            {data.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={busy || choice === (data.overridePlanId ?? '')} onClick={save}>
            Save
          </Button>
        </div>
      ) : null}
      <Link href="/settings/commission" className="mt-2 inline-block text-xs text-primary">
        See plans and rules
      </Link>
    </Card>
  );
}
