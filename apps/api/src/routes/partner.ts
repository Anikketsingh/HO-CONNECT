import {
  partnerApplicationSchema,
  partnerApplicationUpdateSchema,
  partnerDocumentSchema,
  partnerProfileInputSchema,
  registrationOptionsSchema,
  submitApplicationSchema,
} from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError, badRequest, conflict, forbidden } from '../lib/errors';
import { partnerOf } from '../plugins/auth';
import type { PartnerService } from '../services/partners';

/** Partner app: registration, documents and submission. */
export const partnerRoutes: FastifyPluginAsyncZod<{ partners: PartnerService }> = async (app, { partners }) => {
  /** Partner types with their checklists, experience centres, states and the current terms. */
  app.get(
    '/partner/registration-options',
    { preHandler: app.requireUser, schema: { response: { 200: registrationOptionsSchema } } },
    () => partners.registrationOptions(),
  );

  /** Step 1: creates the draft application for the logged-in phone number. */
  app.post(
    '/partner/register',
    {
      preHandler: app.requireUser,
      schema: { body: partnerProfileInputSchema, response: { 201: partnerApplicationSchema } },
    },
    async (req, reply) => {
      const auth = req.auth!;
      if (auth.identity.kind === 'admin') throw forbidden('forbidden', 'Dashboard accounts cannot register as partners.');
      if (auth.identity.kind === 'partner') throw conflict('already_registered', 'You are already registered.');
      const id = await partners.register({ authUserId: auth.authUserId, phone: auth.phone }, req.body);
      reply.code(201);
      return partners.application(id);
    },
  );

  app.get(
    '/partner/application',
    { preHandler: app.requirePartner(), schema: { response: { 200: partnerApplicationSchema } } },
    (req) => partners.application(partnerOf(req).partnerId),
  );

  app.patch(
    '/partner/application',
    {
      preHandler: app.requirePartner(),
      schema: { body: partnerApplicationUpdateSchema, response: { 200: partnerApplicationSchema } },
    },
    (req) => partners.updateApplication(partnerOf(req).partnerId, req.body),
  );

  /** multipart/form-data with one `file` part. The type is checked from the file's bytes. */
  app.post(
    '/partner/application/documents/:documentTypeId',
    {
      preHandler: app.requirePartner(),
      schema: { params: z.object({ documentTypeId: z.uuid() }), response: { 201: partnerDocumentSchema } },
    },
    async (req, reply) => {
      if (!req.isMultipart()) throw badRequest('no_file', 'Choose a file to upload.');
      const file = await req.file();
      if (!file) throw badRequest('no_file', 'Choose a file to upload.');
      let bytes: Buffer;
      try {
        bytes = await file.toBuffer();
      } catch (err) {
        if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          throw new AppError(413, 'file_too_large', 'Files can be up to 10 MB.');
        }
        throw err;
      }
      const doc = await partners.uploadDocument(partnerOf(req).partnerId, req.params.documentTypeId, {
        fileName: file.filename,
        bytes,
      });
      reply.code(201);
      return doc;
    },
  );

  app.delete(
    '/partner/application/documents/:documentId',
    { preHandler: app.requirePartner(), schema: { params: z.object({ documentId: z.uuid() }) } },
    async (req, reply) => {
      await partners.removeDocument(partnerOf(req).partnerId, req.params.documentId);
      return reply.code(204).send();
    },
  );

  app.post(
    '/partner/application/submit',
    {
      preHandler: app.requirePartner(),
      schema: { body: submitApplicationSchema, response: { 200: partnerApplicationSchema } },
    },
    (req) => partners.submit(partnerOf(req).partnerId, req.body.acceptTermsVersion),
  );
};
