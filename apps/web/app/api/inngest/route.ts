import { serve } from 'inngest/next';
import { inngest } from '../../inngest/client';
import { dailyCrawl } from '../../inngest/functions';

// Inngest serve endpoint. Local dev: `npx inngest-cli dev` discovers this route
// (see TOOLS.md). Cloud needs INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY.
export const { GET, POST, PUT } = serve({ client: inngest, functions: [dailyCrawl] });
