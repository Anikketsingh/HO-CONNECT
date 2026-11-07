import {
  partnerApplicationSchema,
  registrationOptionsSchema,
  type PartnerApplication,
  type RegistrationOptions,
} from '@hoc/shared';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, errorMessage } from './api';
import { t } from '@/i18n';
import { useAuth } from './auth';

interface RegistrationContextValue {
  options: RegistrationOptions | null;
  /** null until step 1 has been saved. */
  application: PartnerApplication | null;
  setApplication: (a: PartnerApplication) => void;
  reloadApplication: () => Promise<void>;
  loaded: boolean;
  error: string | null;
  retry: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(null);

export type RegistrationStep = '/register' | '/register/payout' | '/register/documents' | '/register/review';

/** Where to send a partner who opens registration: the first step that still needs something. */
export function nextRegistrationStep(app: PartnerApplication | null): RegistrationStep {
  if (!app) return '/register';
  const keys = app.blockers.map((b) => b.key);
  if (keys.includes('profile')) return '/register';
  if (keys.includes('pan') || keys.includes('payout')) return '/register/payout';
  if (keys.some((k) => k.startsWith('document:'))) return '/register/documents';
  return '/register/review';
}

export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const authReady = state.status === 'ready';
  const isPartner = state.status === 'ready' && state.me.kind === 'partner';

  const [options, setOptions] = useState<RegistrationOptions | null>(null);
  const [application, setApplication] = useState<PartnerApplication | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Load once, when we know whether the user already has an application.
  useEffect(() => {
    if (!authReady || (loaded && attempt === 0)) return;
    let cancelled = false;
    Promise.all([
      api('/v1/partner/registration-options', registrationOptionsSchema),
      isPartner ? api('/v1/partner/application', partnerApplicationSchema) : Promise.resolve(null),
    ])
      .then(([opts, app]) => {
        if (cancelled) return;
        setOptions(opts);
        setApplication(app);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, attempt]);

  const reloadApplication = useCallback(async () => {
    setApplication(await api('/v1/partner/application', partnerApplicationSchema));
  }, []);

  return (
    <RegistrationContext.Provider
      value={{
        options,
        application,
        setApplication,
        reloadApplication,
        loaded,
        error,
        retry: () => setAttempt((n) => n + 1),
      }}
    >
      {children}
    </RegistrationContext.Provider>
  );
}

export function useRegistration(): RegistrationContextValue {
  const ctx = useContext(RegistrationContext);
  if (!ctx) throw new Error('useRegistration must be used inside <RegistrationProvider>');
  return ctx;
}

/** zod issues → { field: first message } */
export function fieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join('.');
    if (key && !out[key]) out[key] = t(i.message);
  }
  return out;
}
