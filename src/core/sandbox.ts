// The browser glue: the frame element, the handshake, the control port, the
// worker links. Everything that decides what a run means is in run.ts.
import { INIT, READY, isWorkerToHost, type FrameToHost, type HostToFrame, type HostToWorker, type WorkerToHost } from '../bridge/protocol';
import { FRAME_PROTOCOL_VERSION, frameDocument, frameVersion } from '../frame/document';
import { WORKER_HASH, WORKER_SOURCE } from '../generated/embeds';
import { SandboxError } from './errors';
import { executeRun, resolveRun, type RunDeps, type WorkerLink } from './run';
import { DEFAULT_CAPS, type Caps, type RunOptions, type RunResult, type SandboxOptions, type SandboxState } from './types';

export interface Sandbox {
  readonly state: SandboxState;
  /** Resolves after the frame's handshake; rejects with `SandboxUnavailable`. */
  readonly ready: Promise<void>;
  run(options: RunOptions): Promise<RunResult>;
  dispose(): void;
}

const uid = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export function createSandbox(options: SandboxOptions): Sandbox {
  return new SandboxImpl(options);
}

class SandboxImpl implements Sandbox {
  state: SandboxState = 'idle';
  private readonly caps: Caps;
  private readonly workerPerRun: boolean;
  private readonly bootTimeoutMs: number;
  private iframe: HTMLIFrameElement | null = null;
  private control: MessagePort | null = null;
  private readonly nonce = uid();
  private readyPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly frameListeners = new Map<string, (m: FrameToHost) => void>();
  private pooled: WorkerLink | null = null;
  private readonly links = new Set<WorkerLink>();

  constructor(private readonly options: SandboxOptions) {
    this.caps = { ...DEFAULT_CAPS, ...options.caps };
    this.workerPerRun = options.workerPerRun ?? true;
    this.bootTimeoutMs = options.bootTimeoutMs ?? 10_000;
    if (options.warm) void this.ready.catch(() => undefined);
  }

  get ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.boot();
    return this.readyPromise;
  }

  run(options: RunOptions): Promise<RunResult> {
    const runId = uid();
    const task = async (): Promise<RunResult> => {
      const resolved = resolveRun(options, runId, this.caps);
      try {
        await this.ready;
      } catch (err) {
        return { runId, status: 'error', error: { name: 'SandboxUnavailable', message: err instanceof Error ? err.message : String(err) }, logs: [], calls: [], stats: { ms: 0, opsUsed: 0, logsDropped: 0 } };
      }
      let result = await executeRun(this.deps, resolved);
      // collect + batch hook: the library owns the resume loop.
      const approval = resolved.approval;
      while (result.status === 'pending' && approval.mode === 'collect' && approval.onApproval) {
        let decisions;
        try {
          decisions = await approval.onApproval(result.pending, { runId });
        } catch (err) {
          return { ...result, status: 'error', error: { name: 'ApprovalRejected', message: `onApproval failed: ${err instanceof Error ? err.message : String(err)}` } } as RunResult;
        }
        if (resolved.signal?.aborted) return { ...result, status: 'aborted' } as RunResult;
        try {
          result = await result.resume(decisions);
        } catch (err) {
          return { ...result, status: 'error', error: { name: err instanceof Error ? err.name : 'Error', message: err instanceof Error ? err.message : String(err) } } as RunResult;
        }
      }
      return result;
    };
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  dispose(): void {
    for (const l of this.links) l.kill();
    this.links.clear();
    this.pooled = null;
    this.control?.close();
    this.control = null;
    this.iframe?.remove();
    this.iframe = null;
    this.state = 'disposed';
  }

  private readonly deps: RunDeps = {
    spawn: () => this.spawn(),
    release: (link, reusable) => {
      if (!this.workerPerRun && reusable && !this.pooled) {
        this.pooled = link;
        return;
      }
      link.kill();
    },
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };

  private boot(): Promise<void> {
    if (typeof document === 'undefined' || typeof MessageChannel === 'undefined') {
      this.state = 'failed';
      return Promise.reject(new SandboxError('SandboxUnavailable', 'no DOM or MessageChannel in this environment'));
    }
    this.state = 'booting';
    return new Promise<void>((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      iframe.setAttribute('title', 'sandbox');
      iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;overflow:hidden;visibility:hidden;pointer-events:none';
      const fail = (message: string) => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        this.state = 'failed';
        iframe.remove();
        this.iframe = null;
        reject(new SandboxError('SandboxUnavailable', message));
      };
      const onMessage = (ev: MessageEvent) => {
        if (ev.source !== iframe.contentWindow) return;
        const d = ev.data as { t?: unknown; v?: unknown } | null;
        if (!d || d.t !== READY) return;
        if (d.v !== FRAME_PROTOCOL_VERSION) return fail(`frame protocol ${String(d.v)}, expected ${FRAME_PROTOCOL_VERSION}`);
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        const channel = new MessageChannel();
        this.control = channel.port1;
        this.control.onmessage = (e) => {
          const m = e.data as FrameToHost | null;
          if (!m || typeof m !== 'object') return;
          this.frameListeners.get(m.id)?.(m);
        };
        iframe.contentWindow!.postMessage({ t: INIT, nonce: this.nonce, v: FRAME_PROTOCOL_VERSION }, '*', [channel.port2]);
        this.state = 'ready';
        resolve();
      };
      const timer = setTimeout(() => fail(`the sandbox frame did not answer within ${this.bootTimeoutMs} ms`), this.bootTimeoutMs);
      window.addEventListener('message', onMessage);
      iframe.addEventListener('error', () => fail('the sandbox frame failed to load'));
      this.iframe = iframe;
      if (this.options.frame.srcdoc) iframe.srcdoc = frameDocument();
      else {
        const u = new URL(this.options.frame.url, typeof location !== 'undefined' ? location.href : undefined);
        u.searchParams.set('v', frameVersion());
        iframe.src = u.toString();
      }
      (this.options.container ?? document.body).appendChild(iframe);
    });
  }

  private spawn(): Promise<WorkerLink> {
    if (this.pooled) {
      const l = this.pooled;
      this.pooled = null;
      return Promise.resolve(l);
    }
    const control = this.control;
    if (!control) return Promise.reject(new SandboxError('SandboxUnavailable', 'the sandbox is not ready'));
    return new Promise<WorkerLink>((resolve, reject) => {
      const id = uid();
      const channel = new MessageChannel();
      let errorCb: ((m: string) => void) | null = null;
      let messageCb: ((m: WorkerToHost) => void) | null = null;
      const timer = setTimeout(() => {
        this.frameListeners.delete(id);
        reject(new SandboxError('SandboxUnavailable', 'the sandbox frame did not spawn a worker in time'));
      }, this.bootTimeoutMs);
      const link: WorkerLink = {
        post: (m: HostToWorker) => channel.port1.postMessage(m),
        onMessage: (cb) => {
          messageCb = cb;
        },
        onError: (cb) => {
          errorCb = cb;
        },
        kill: () => {
          this.links.delete(link);
          this.frameListeners.delete(id);
          channel.port1.close();
          const msg: HostToFrame = { t: 'kill', nonce: this.nonce, id };
          try {
            control.postMessage(msg);
          } catch {
            /* control gone */
          }
        },
      };
      channel.port1.onmessage = (e) => {
        if (isWorkerToHost(e.data)) messageCb?.(e.data);
      };
      this.frameListeners.set(id, (m) => {
        if (m.t === 'spawned') {
          clearTimeout(timer);
          this.links.add(link);
          resolve(link);
        } else if (m.t === 'spawn-error') {
          clearTimeout(timer);
          this.frameListeners.delete(id);
          reject(new SandboxError('SandboxUnavailable', `the sandbox frame could not start a worker: ${m.message}`));
        } else if (m.t === 'worker-error') errorCb?.(m.message);
      });
      const msg: HostToFrame = { t: 'spawn', nonce: this.nonce, id, source: WORKER_SOURCE, sourceHash: WORKER_HASH };
      control.postMessage(msg, [channel.port2]);
    });
  }
}
