/**
 * Alert delivery (DESIGN.md: Slack/email delta alerts). Eligibility + content are
 * pure (@regdelta/core: eligibleAlertCards, buildAlertContent — Invariant 7 gates
 * high-materiality on human approval); this module is the delivery seam. A
 * `Notifier` has one method; the channel adapters (Slack webhook, Resend email)
 * live behind the HttpClient seam and are constructed only when configured.
 */
import {
  buildAlertContent,
  eligibleAlertCards,
  type AlertContent,
  type EventRecord,
  type PublishedChangeCard,
} from '@regdelta/core';

export interface DeliveryResult {
  readonly cardId: string;
  readonly channel: string;
  readonly delivered: boolean;
  readonly detail: string;
}

export interface Notifier {
  readonly channel: string;
  send(content: AlertContent, cardId: string): Promise<DeliveryResult>;
}

/** Default no-network notifier — records intent (dev, and the fallback when nothing is configured). */
export const consoleNotifier: Notifier = {
  channel: 'console',
  send(content, cardId): Promise<DeliveryResult> {
    return Promise.resolve({
      cardId,
      channel: 'console',
      delivered: true,
      detail: `would deliver: ${content.subject}`,
    });
  },
};

/**
 * Dispatch alerts for every eligible card. Each delivery is independent: a failing
 * channel is reported, never thrown (a lost alert must be visible, not silent).
 */
export async function dispatchAlerts(
  notifier: Notifier,
  cards: readonly PublishedChangeCard[],
  events: readonly EventRecord[],
): Promise<readonly DeliveryResult[]> {
  const eligible = eligibleAlertCards(cards, events);
  const results: DeliveryResult[] = [];
  for (const card of eligible) {
    try {
      results.push(await notifier.send(buildAlertContent(card), card.id));
    } catch (error: unknown) {
      results.push({
        cardId: card.id,
        channel: notifier.channel,
        delivered: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
