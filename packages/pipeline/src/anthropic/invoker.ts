/**
 * Anthropic Messages API access, behind a tiny injectable seam (`ModelInvoker`).
 *
 * The live model ports depend only on `ModelInvoker.invokeTool` — a single
 * structured-output call (tool use with a forced tool) returning the tool input
 * as `unknown`, which the caller zod-validates. This keeps every port unit-
 * testable offline with a fake invoker, and keeps `just ci` network-free: the
 * real invoker is only constructed by the live eval entrypoint. Dependency-free
 * (Node 22 global fetch) so the frozen lockfile is untouched.
 */

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface ToolCall {
  readonly model: string;
  readonly system?: string;
  readonly userText: string;
  readonly toolName: string;
  readonly toolDescription: string;
  /** JSON Schema for the tool input — the structured output shape. */
  readonly inputSchema: Record<string, unknown>;
  readonly maxTokens: number;
}

export interface ModelInvoker {
  /** Force the model to call `toolName`; return its (unvalidated) tool input. */
  invokeTool(call: ToolCall): Promise<unknown>;
}

export class AnthropicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnthropicError';
  }
}

interface AnthropicContentBlock {
  readonly type: string;
  readonly name?: string;
  readonly input?: unknown;
}

interface AnthropicResponse {
  readonly content?: readonly AnthropicContentBlock[];
}

export interface AnthropicInvokerConfig {
  readonly apiKey: string;
  readonly timeoutMs?: number;
  /** Injected for tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
}

/** Build a live invoker. Validates the API key is present, failing fast by name. */
export function createAnthropicInvoker(env: Record<string, string | undefined>): ModelInvoker {
  const apiKey = env['ANTHROPIC_API_KEY'];
  if (typeof apiKey !== 'string' || apiKey === '') {
    throw new AnthropicError('ANTHROPIC_API_KEY is not set — required for live model calls');
  }
  return anthropicInvoker({ apiKey });
}

export function anthropicInvoker(config: AnthropicInvokerConfig): ModelInvoker {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    async invokeTool(call: ToolCall): Promise<unknown> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: call.model,
            max_tokens: call.maxTokens,
            ...(call.system === undefined ? {} : { system: call.system }),
            tools: [
              {
                name: call.toolName,
                description: call.toolDescription,
                input_schema: call.inputSchema,
              },
            ],
            tool_choice: { type: 'tool', name: call.toolName },
            messages: [{ role: 'user', content: call.userText }],
          }),
        });
        if (!response.ok) {
          const body = await safeBody(response);
          throw new AnthropicError(`Anthropic API ${response.status}: ${body.slice(0, 300)}`);
        }
        const json = (await response.json()) as AnthropicResponse;
        const toolUse = (json.content ?? []).find(
          (block) => block.type === 'tool_use' && block.name === call.toolName,
        );
        if (toolUse === undefined || toolUse.input === undefined) {
          throw new AnthropicError(
            `Anthropic response contained no tool_use block for "${call.toolName}"`,
          );
        }
        return toolUse.input;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

async function safeBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<unreadable response body>';
  }
}
