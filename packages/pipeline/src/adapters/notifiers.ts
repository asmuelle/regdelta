/**
 * Channel adapters for alert delivery, behind the HttpClient seam (real network
 * only when configured; offline-tested with a fake client). `notifierFromEnv`
 * picks the configured channel, falling back to the console notifier so a deploy
 * without delivery secrets still runs (and says so), never silently dropping alerts.
 */
import type { AlertContent } from '@regdelta/core';
import type { HttpClient } from '../http';
import { consoleNotifier, type DeliveryResult, type Notifier } from '../notify';

const RESEND_URL = 'https://api.resend.com/emails';

/** Slack incoming webhook notifier (set SLACK_WEBHOOK_URL). */
export function slackNotifier(webhookUrl: string, http: HttpClient): Notifier {
  return {
    channel: 'slack',
    async send(content: AlertContent, cardId: string): Promise<DeliveryResult> {
      const res = await http.post(
        webhookUrl,
        JSON.stringify({ text: `*${content.subject}*\n${content.body}` }),
        { 'content-type': 'application/json' },
      );
      return {
        cardId,
        channel: 'slack',
        delivered: res.ok,
        detail: res.ok
          ? 'posted to Slack webhook'
          : `Slack webhook HTTP ${res.status}: ${res.text.slice(0, 120)}`,
      };
    },
  };
}

export interface ResendConfig {
  readonly apiKey: string;
  readonly from: string;
  readonly to: readonly string[];
}

/** Resend email notifier (set RESEND_API_KEY + ALERT_EMAIL_FROM/TO). */
export function resendNotifier(config: ResendConfig, http: HttpClient): Notifier {
  return {
    channel: 'email',
    async send(content: AlertContent, cardId: string): Promise<DeliveryResult> {
      const res = await http.post(
        RESEND_URL,
        JSON.stringify({
          from: config.from,
          to: config.to,
          subject: content.subject,
          text: content.body,
        }),
        { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      );
      return {
        cardId,
        channel: 'email',
        delivered: res.ok,
        detail: res.ok
          ? `emailed ${config.to.length} recipient(s)`
          : `Resend HTTP ${res.status}: ${res.text.slice(0, 120)}`,
      };
    },
  };
}

/** Choose a notifier from env: Slack if a webhook is set, else Resend if keyed, else console. */
export function notifierFromEnv(
  env: Record<string, string | undefined>,
  http: HttpClient,
): Notifier {
  const slackUrl = env['SLACK_WEBHOOK_URL'];
  if (typeof slackUrl === 'string' && slackUrl.length > 0) {
    return slackNotifier(slackUrl, http);
  }
  const resendKey = env['RESEND_API_KEY'];
  const from = env['ALERT_EMAIL_FROM'];
  const to = (env['ALERT_EMAIL_TO'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (
    typeof resendKey === 'string' &&
    resendKey.length > 0 &&
    typeof from === 'string' &&
    to.length > 0
  ) {
    return resendNotifier({ apiKey: resendKey, from, to }, http);
  }
  return consoleNotifier;
}
