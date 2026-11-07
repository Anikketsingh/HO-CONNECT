import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Legacy HS256 projects only. When empty, tokens are verified against the project's JWKS. */
  SUPABASE_JWT_SECRET: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  /** 32 random bytes, base64 — encrypts PAN and payout details. */
  DATA_ENCRYPTION_KEY: z.string().min(1),
  /**
   * Customer consent SMS. "console" prints codes to the log (development; the app also shows them).
   * "nimbus" sends real SMS: needs the NIMBUS_* values below and a DLT template id on the
   * `consent_otp` row of message_templates.
   */
  OTP_PROVIDER: z.enum(['console', 'nimbus']).default('console'),
  NIMBUS_USER_ID: z.string().optional(),
  NIMBUS_PASSWORD: z.string().optional(),
  NIMBUS_SENDER_ID: z.string().optional(),
  NIMBUS_ENTITY_ID: z.string().optional(),
  /** Where the customer QR / link page lives (the dashboard app serves /r/<code>). Must be reachable from customers' phones. */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  /** The AI try-on app. Partner try-on QR codes open this with the partner's UTM tags. */
  TRYON_WEB_URL: z.string().url().default('https://aitryon.hairoriginals.com'),
  /** "expo" sends real push notifications (partners need a build that supports them); "console" only logs. */
  PUSH_PROVIDER: z.enum(['expo', 'console']).default('expo'),
  /** Optional: enables Expo's "enhanced push security". */
  EXPO_ACCESS_TOKEN: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.OTP_PROVIDER === 'nimbus') {
    for (const key of ['NIMBUS_USER_ID', 'NIMBUS_PASSWORD', 'NIMBUS_SENDER_ID', 'NIMBUS_ENTITY_ID'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when OTP_PROVIDER=nimbus' });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example at the repo root.`);
  }
  return parsed.data;
}
