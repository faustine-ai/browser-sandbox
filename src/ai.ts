// AI SDK (`useChat` / `Chat`) adapter. The AI SDK has one `onToolCall` per
// chat and answers through `addToolOutput`; the sandbox's tool is one entry
// in a map the host builds here, or the host dispatches by hand with
// `runCodeTool(...).handle`. No runtime import of `ai`.
import { toToolOutput } from './core/output';
import type { Sandbox } from './core/sandbox';
import type { ApprovalOptions, Caps, RunOptions, RunResult } from './core/types';
import type { FunctionEntry, FunctionMap } from './functions/define';
import { isFunctionName } from './functions/define';

/** The subset of the AI SDK's tool call the adapter reads. */
export interface AiToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
  dynamic?: boolean;
}

/** What the adapter needs from `useChat()`'s return value or a `Chat` instance. */
export interface AiChatLike {
  addToolOutput(options: { tool: string; toolCallId: string; output: unknown } | { tool: string; toolCallId: string; state: 'output-error'; errorText: string }): unknown;
}

export interface ClientToolHandler {
  readonly name: string;
  handle(toolCall: AiToolCall): Promise<unknown>;
}

export interface RunCodeToolOptions {
  sandbox: Sandbox;
  functions: FunctionMap;
  scope?: RunOptions['scope'];
  approval?: ApprovalOptions;
  caps?: Partial<Caps>;
  /** The tool's name in the chat. Default `runCode`. */
  name?: string;
  /** The input field holding the code. Default `code`. */
  codeKey?: string;
  /** Every result, before it is mapped to the tool output. */
  onResult?: (result: RunResult, toolCall: AiToolCall) => void;
  /** The tool output for a result. Default `toToolOutput`. */
  output?: (result: RunResult) => unknown;
  signal?: AbortSignal;
}

/** The `runCode` client tool: `handle` runs the code and returns the tool output. */
export function runCodeTool(options: RunCodeToolOptions): ClientToolHandler {
  const name = options.name ?? 'runCode';
  const codeKey = options.codeKey ?? 'code';
  const output = options.output ?? toToolOutput;
  return {
    name,
    async handle(toolCall) {
      const input = (toolCall.input ?? {}) as Record<string, unknown>;
      const code = input[codeKey];
      if (typeof code !== 'string') return { ok: false, error: `${codeKey} must be a string` };
      const result = await options.sandbox.run({ code, functions: options.functions, scope: options.scope, approval: options.approval, caps: options.caps, signal: options.signal });
      options.onResult?.(result, toolCall);
      return output(result);
    },
  };
}

export type ClientToolEntry = ClientToolHandler | ((input: unknown, toolCall: AiToolCall) => unknown) | 'external';

export interface ClientTools {
  /** Pass as `onToolCall` to `useChat` / `Chat`. */
  onToolCall(event: { toolCall: AiToolCall }): Promise<void>;
  /** Give the helper `addToolOutput`; outputs produced before this are delivered then. */
  attach(chat: AiChatLike): void;
  /** Dispatch one call by hand. */
  handle(toolCall: AiToolCall): Promise<{ handled: boolean; output?: unknown; error?: string }>;
}

export interface ClientToolsOptions {
  /** A call for a name outside the map. Default: `console.warn`. */
  onUnknown?: (toolCall: AiToolCall) => void;
}

/** Builds the chat's `onToolCall` from a map of client tools; dispatch is by name. */
export function clientTools(map: Record<string, ClientToolEntry>, options: ClientToolsOptions = {}): ClientTools {
  let chat: AiChatLike | null = null;
  const queued: Parameters<AiChatLike['addToolOutput']>[0][] = [];
  const deliver = (o: Parameters<AiChatLike['addToolOutput']>[0]) => {
    if (chat) chat.addToolOutput(o);
    else queued.push(o);
  };
  const handle = async (toolCall: AiToolCall): Promise<{ handled: boolean; output?: unknown; error?: string }> => {
    const entry = map[toolCall.toolName];
    if (entry === undefined) {
      (options.onUnknown ?? ((c) => console.warn(`[browser-sandbox] no client tool named "${c.toolName}"`)))(toolCall);
      return { handled: false };
    }
    if (entry === 'external') return { handled: false };
    try {
      const output = typeof entry === 'function' ? await entry(toolCall.input, toolCall) : await entry.handle(toolCall);
      return { handled: true, output };
    } catch (err) {
      return { handled: true, error: err instanceof Error ? err.message : String(err) };
    }
  };
  return {
    handle,
    attach(c) {
      chat = c;
      for (const o of queued.splice(0)) c.addToolOutput(o);
    },
    async onToolCall({ toolCall }) {
      const r = await handle(toolCall);
      if (!r.handled) return;
      if (r.error !== undefined) deliver({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, state: 'output-error', errorText: r.error });
      else deliver({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output: r.output });
    },
  };
}

/** The subset of an AI SDK tool definition `fromTools` reads. */
export interface AiToolLike {
  description?: string;
  inputSchema?: unknown;
  needsApproval?: boolean | ((...args: unknown[]) => unknown);
  execute?: (input: unknown, options: { toolCallId: string; messages: unknown[]; abortSignal?: AbortSignal }) => unknown;
}

export interface FromToolsOptions {
  /** Prefix inside the tree: `app` → `sdk.app.<name>`. */
  namespace?: string;
  /** Which tools need approval. Default: `needsApproval === true`. */
  approval?: (tool: AiToolLike, name: string) => boolean;
}

/** Client-executed AI SDK tools as sandbox functions (tools without `execute` are skipped). */
export function fromTools(tools: Record<string, AiToolLike>, options: FromToolsOptions = {}): Record<string, FunctionEntry> {
  const out: Record<string, FunctionEntry> = {};
  const approval = options.approval ?? ((t) => t.needsApproval === true);
  for (const [name, tool] of Object.entries(tools)) {
    const execute = tool.execute;
    if (typeof execute !== 'function') continue;
    const full = options.namespace ? `${options.namespace}.${name}` : name;
    if (!isFunctionName(full)) throw new Error(`tool name "${full}" is not usable inside the sandbox`);
    const entry: FunctionEntry = { call: (input) => execute(input, { toolCallId: `sandbox:${full}`, messages: [] }) };
    if (approval(tool, name)) entry.approval = true;
    if (tool.description) entry.description = tool.description;
    const schema = tool.inputSchema;
    if (schema && typeof schema === 'object' && ('type' in schema || 'properties' in schema || '$schema' in schema)) entry.input = schema;
    out[full] = entry;
  }
  return out;
}
