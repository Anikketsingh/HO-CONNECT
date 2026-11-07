import { createDb } from '@hoc/db';
import { config } from 'dotenv';
import { buildApp } from './app';
import { loadEnv } from './env';
import { createFieldCipher } from './lib/crypto';
import { createDbIdentityResolver } from './lib/identity';
import { createOverviewQuery } from './lib/overview';
import { createNotifier } from './lib/notify';
import { createConsolePush, createExpoPush } from './lib/push';
import { createConsoleSms, createNimbusSms, type SmsSender } from './lib/sms';
import { createSupabaseAuthAdmin } from './lib/auth-admin';
import { createSupabaseStorage } from './lib/storage';
import { createSupabaseTokenVerifier } from './lib/token';
import { createCommissionService } from './services/commissions';
import { createEarningsService } from './services/earnings';
import { createLeadService } from './services/leads';
import { createPartnerService } from './services/partners';
import { createPayoutService } from './services/payouts';
import { createPrivacyService } from './services/privacy';
import { createQrCodeService } from './services/qr-codes';
import { createReportService } from './services/reports';
import { createTeamService } from './services/team';

// Local dev: read .env from the API folder or the repo root. On Railway, env vars are injected.
config({ path: ['.env', '../../.env'], quiet: true });

const env = loadEnv();
const cipher = createFieldCipher(env.DATA_ENCRYPTION_KEY); // throws on a bad key

const { db, sql } = createDb(env.DATABASE_URL);
const storage = createSupabaseStorage({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY });

const sms: SmsSender =
  env.OTP_PROVIDER === 'nimbus'
    ? createNimbusSms({
        userId: env.NIMBUS_USER_ID!,
        password: env.NIMBUS_PASSWORD!,
        senderId: env.NIMBUS_SENDER_ID!,
        entityId: env.NIMBUS_ENTITY_ID!,
      })
    : createConsoleSms((line) => process.stdout.write(`${line}\n`));

const authAdmin = createSupabaseAuthAdmin({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY });
const push = env.PUSH_PROVIDER === 'expo' ? createExpoPush({ accessToken: env.EXPO_ACCESS_TOKEN }) : createConsolePush((l) => process.stdout.write(`${l}\n`));
const notify = createNotifier({ db, push, log: (msg, err) => console.error(msg, err instanceof Error ? err.message : (err ?? '')) });

const leads = createLeadService({
  db,
  sms,
  otpSecret: env.DATA_ENCRYPTION_KEY,
  // Codes are returned to the app only in local development without real SMS.
  devCodes: env.NODE_ENV === 'development' && env.OTP_PROVIDER === 'console',
  notify,
});

const commissions = createCommissionService({ db, notify });
const payouts = createPayoutService({ db, cipher, notify });
const earnings = createEarningsService({ db, publicWebUrl: env.PUBLIC_WEB_URL, tryOnUrl: env.TRYON_WEB_URL });

const app = await buildApp({
  corsOrigins: env.CORS_ORIGINS,
  verifyToken: createSupabaseTokenVerifier({ supabaseUrl: env.SUPABASE_URL, jwtSecret: env.SUPABASE_JWT_SECRET }),
  resolveIdentity: createDbIdentityResolver(db),
  getOverview: createOverviewQuery(db),
  partners: createPartnerService({ db, cipher, storage, notify }),
  leads,
  commissions,
  payouts,
  earnings,
  reports: createReportService({ db }),
  team: createTeamService({ db, authAdmin }),
  privacy: createPrivacyService({ db, authAdmin, storage }),
  qrCodes: createQrCodeService({ db, tryOnUrl: env.TRYON_WEB_URL }),
  checkDb: async () => {
    await sql`select 1`;
  },
  version: process.env.npm_package_version ?? '0.1.0',
  logger: {
    level: env.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.body.code'],
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  },
});

if (env.NODE_ENV === 'production' && env.OTP_PROVIDER === 'console') {
  app.log.warn('OTP_PROVIDER=console in production: customer consent codes are NOT being sent');
}

// Background jobs, every 10 minutes (single API instance in the MVP):
// expire leads whose customer didn't confirm, and release commissions whose hold period is over.
async function runJobs() {
  try {
    const n = await leads.expireDue();
    if (n) app.log.info({ expired: n }, 'expired unconfirmed leads');
    const holds = await commissions.advanceHolds();
    if (holds.released || holds.autoApproved) app.log.info(holds, 'commission holds advanced');
  } catch (err) {
    app.log.error({ err }, 'background job failed');
  }
}
void runJobs();
const expiryTimer = setInterval(() => void runJobs(), 10 * 60 * 1000);

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  clearInterval(expiryTimer);
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: env.HOST, port: env.PORT });
