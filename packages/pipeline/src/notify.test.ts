import { describe, expect, it } from 'vitest';
import type { PublishedChangeCard } from '@regdelta/core';
import type { HttpClient, HttpResponse } from './http';
import { consoleNotifier, dispatchAlerts, type Notifier } from './notify';
import { notifierFromEnv, resendNotifier, slackNotifier } from './adapters/notifiers';

function card(overrides: Partial<PublishedChangeCard> = {}): PublishedChangeCard {
  return {
    id: 'card-1',
    deltaId: 'delta-1',
    companyId: 'co-1',
    title: 'Reg Z HELOC disclosure timing',
    summary: 'Disclosure timing moved to application-receipt basis.',
    requiredAction: 'review the pinned citations and confirm applicability — decision support',
    affectedProducts: ['HELOC'],
    effectiveDate: '2026-10-01',
    deadline: null,
    materiality: 'normal',
    redline: [],
    claims: [],
    reviewState: 'auto',
    publishedAt: '2026-06-10T06:00:10.000Z',
    ...overrides,
  };
}

function http(response: HttpResponse, capture?: (url: string, body: string) => void): HttpClient {
  return {
    get: () => Promise.resolve(response),
    post: (url, body) => {
      capture?.(url, body);
      return Promise.resolve(response);
    },
  };
}

describe('dispatchAlerts', () => {
  it('dispatches eligible cards and skips a high-materiality card without approval', async () => {
    const cards = [
      card({ id: 'normal-pub' }),
      card({ id: 'high-unapproved', materiality: 'high' }),
      card({ id: 'unpublished', publishedAt: null }),
    ];
    const results = await dispatchAlerts(consoleNotifier, cards, []);
    expect(results.map((r) => r.cardId)).toEqual(['normal-pub']); // only the eligible one
    expect(results[0]?.delivered).toBe(true);
  });

  it('reports a failing channel instead of throwing (a lost alert is visible)', async () => {
    const flaky: Notifier = {
      channel: 'flaky',
      send: () => Promise.reject(new Error('channel down')),
    };
    const results = await dispatchAlerts(flaky, [card()], []);
    expect(results[0]?.delivered).toBe(false);
    expect(results[0]?.detail).toContain('channel down');
  });
});

describe('slack / resend notifiers (offline, fake HTTP)', () => {
  it('slack posts the alert and marks it delivered on 200', async () => {
    let sent = '';
    const notifier = slackNotifier(
      'https://hooks.slack.test/x',
      http({ status: 200, ok: true, text: 'ok' }, (_u, b) => (sent = b)),
    );
    const result = await dispatchAlerts(notifier, [card()], []);
    expect(result[0]?.delivered).toBe(true);
    expect(JSON.parse(sent).text).toContain('Reg Z HELOC');
  });

  it('slack marks not-delivered on a non-200 response', async () => {
    const notifier = slackNotifier(
      'https://hooks.slack.test/x',
      http({ status: 500, ok: false, text: 'boom' }),
    );
    const result = await dispatchAlerts(notifier, [card()], []);
    expect(result[0]?.delivered).toBe(false);
    expect(result[0]?.detail).toContain('500');
  });

  it('resend sends with an authorization header', async () => {
    const notifier = resendNotifier(
      { apiKey: 'rk_test', from: 'alerts@regdelta.example', to: ['officer@meridian.example'] },
      http({ status: 200, ok: true, text: '{"id":"e1"}' }),
    );
    const result = await dispatchAlerts(notifier, [card()], []);
    expect(result[0]?.channel).toBe('email');
    expect(result[0]?.delivered).toBe(true);
  });
});

describe('notifierFromEnv', () => {
  const fake = http({ status: 200, ok: true, text: 'ok' });
  it('prefers Slack when a webhook is configured', () => {
    expect(notifierFromEnv({ SLACK_WEBHOOK_URL: 'https://x' }, fake).channel).toBe('slack');
  });
  it('uses email when Resend is fully configured', () => {
    expect(
      notifierFromEnv(
        { RESEND_API_KEY: 'rk', ALERT_EMAIL_FROM: 'a@b.com', ALERT_EMAIL_TO: 'c@d.com' },
        fake,
      ).channel,
    ).toBe('email');
  });
  it('falls back to console when nothing is configured', () => {
    expect(notifierFromEnv({}, fake).channel).toBe('console');
  });
});
