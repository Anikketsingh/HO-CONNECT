// supabase/functions/send-sms/index.ts
//
// Entry point for the Supabase Auth "Send SMS" hook. The logic is in handler.ts.
// Deploy: see README → "Partner SMS login (Nimbus)".

import { createSendSmsHandler } from "./handler.ts";

Deno.serve(createSendSmsHandler({ env: (name) => Deno.env.get(name), fetch }));
