import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { MAX_UPLOAD_BYTES } from '@hoc/shared';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { IdentityResolver } from './lib/identity';
import type { OverviewQuery } from './lib/overview';
import type { TokenVerifier } from './lib/token';
import { authPlugin } from './plugins/auth';
import { adminRoutes } from './routes/admin';
import { adminLeadRoutes } from './routes/admin-leads';
import { adminMoneyRoutes } from './routes/admin-money';
import { adminOpsRoutes } from './routes/admin-ops';
import { adminPayoutRoutes } from './routes/admin-payouts';
import { adminPartnerRoutes } from './routes/admin-partners';
import { adminQrCodeRoutes } from './routes/admin-qr-codes';
import { adminSettingsRoutes } from './routes/admin-settings';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { partnerRoutes } from './routes/partner';
import { privacyRoutes } from './routes/privacy';
import { partnerMoneyRoutes } from './routes/partner-money';
import { publicRoutes } from './routes/public';
import { partnerLeadRoutes } from './routes/partner-leads';
import type { CommissionService } from './services/commissions';
import type { EarningsService } from './services/earnings';
import type { LeadService } from './services/leads';
import type { PayoutService } from './services/payouts';
import type { PrivacyService } from './services/privacy';
import type { QrCodeService } from './services/qr-codes';
import type { ReportService } from './services/reports';
import type { TeamService } from './services/team';
import type { PartnerService } from './services/partners';

export interface AppDeps {
  corsOrigins: string[];
  verifyToken: TokenVerifier;
  resolveIdentity: IdentityResolver;
  getOverview: OverviewQuery;
  partners: PartnerService;
  leads: LeadService;
  commissions: CommissionService;
  payouts: PayoutService;
  earnings: EarningsService;
  reports: ReportService;
  team: TeamService;
  privacy: PrivacyService;
  qrCodes: QrCodeService;
  checkDb?: () => Promise<void>;
  logger?: FastifyServerOptions['logger'];
  version?: string;
  /** Per-IP rate limiting. On by default; tests that fire many requests from one address turn it off. */
  rateLimit?: boolean;
}

/** Builds the Fastify app. Dependencies are injected so tests can run without Supabase. */
export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    logger: deps.logger ?? false,
    trustProxy: true, // behind Railway's proxy; needed for correct client IPs in rate limiting
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error, req, reply) => {
    const err = error as FastifyError;
    if (hasZodFastifySchemaValidationErrors(err)) {
      // The first message is written for the user (e.g. "Enter a valid PAN, e.g. ABCDE1234F").
      const first = err.validation[0]?.message;
      return reply.code(400).send({
        error: { code: 'validation_error', message: first || 'Some fields are invalid', issues: err.validation },
      });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    return reply.code(status).send({
      error: {
        code: err.code ?? 'internal_error',
        message: status >= 500 ? 'Something went wrong' : err.message,
      },
    });
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: deps.corsOrigins,
    // The plugin's default is GET, HEAD and POST only, which makes browsers block every PATCH, PUT and DELETE the dashboard sends.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: ['Content-Disposition'],
  });
  if (deps.rateLimit !== false) await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2, parts: 3 } });
  await app.register(authPlugin, { verifyToken: deps.verifyToken, resolveIdentity: deps.resolveIdentity });

  await app.register(healthRoutes, { version: deps.version ?? '0.0.0', checkDb: deps.checkDb });
  await app.register(meRoutes, { prefix: '/v1' });
  await app.register(adminRoutes, { prefix: '/v1', getOverview: deps.getOverview });
  await app.register(partnerRoutes, { prefix: '/v1', partners: deps.partners });
  await app.register(adminPartnerRoutes, { prefix: '/v1', partners: deps.partners, earnings: deps.earnings });
  await app.register(adminSettingsRoutes, { prefix: '/v1', partners: deps.partners });
  await app.register(partnerLeadRoutes, { prefix: '/v1', leads: deps.leads });
  await app.register(adminLeadRoutes, { prefix: '/v1', leads: deps.leads });
  await app.register(adminMoneyRoutes, { prefix: '/v1', commissions: deps.commissions });
  await app.register(adminPayoutRoutes, { prefix: '/v1', payouts: deps.payouts });
  await app.register(partnerMoneyRoutes, { prefix: '/v1', earnings: deps.earnings, commissions: deps.commissions });
  await app.register(adminOpsRoutes, { prefix: '/v1', reports: deps.reports, team: deps.team, privacy: deps.privacy });
  await app.register(adminQrCodeRoutes, { prefix: '/v1', qrCodes: deps.qrCodes });
  await app.register(privacyRoutes, { prefix: '/v1', privacy: deps.privacy });
  await app.register(publicRoutes, { prefix: '/v1', leads: deps.leads, earnings: deps.earnings });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
