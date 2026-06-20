/**
 * HTTP client seam for live source adapters. A tiny injectable interface so the
 * Federal Register / eCFR adapters are unit-tested offline with canned responses
 * (the parsing is the risky part), and `just ci` never hits the network. The real
 * client is constructed only on the live crawl path. Dependency-free (Node fetch).
 */

const DEFAULT_TIMEOUT_MS = 30_000;
// Federal Register / eCFR ask crawlers to identify themselves (be a good citizen).
const DEFAULT_USER_AGENT = 'RegDelta/0.1 (compliance monitoring; contact: ops@regdelta.example)';

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly text: string;
}

export interface HttpClient {
  get(url: string, headers?: Readonly<Record<string, string>>): Promise<HttpResponse>;
  post(
    url: string,
    body: string,
    headers?: Readonly<Record<string, string>>,
  ): Promise<HttpResponse>;
}

export class HttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface HttpClientOptions {
  readonly timeoutMs?: number;
  readonly userAgent?: string;
  /** Injected for tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  async function request(
    method: 'GET' | 'POST',
    url: string,
    headers: Readonly<Record<string, string>> | undefined,
    body: string | undefined,
  ): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          'user-agent': userAgent,
          accept: 'application/json, text/plain, */*',
          ...headers,
        },
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
      return { status: response.status, ok: response.ok, text: await response.text() };
    } catch (error: unknown) {
      throw new HttpError(
        `${method} ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get: (url, headers) => request('GET', url, headers, undefined),
    post: (url, body, headers) => request('POST', url, headers, body),
  };
}
