import { Inngest } from 'inngest';

/** Inngest client for RegDelta's scheduled pipeline (DESIGN.md: deterministic, not agentic). */
export const inngest = new Inngest({ id: 'regdelta' });
