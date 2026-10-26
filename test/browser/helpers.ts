import { expect, type Page } from '@playwright/test';

export type Stripped = {
  runId: string;
  status: 'ok' | 'error' | 'limit' | 'aborted' | 'pending';
  value?: unknown;
  error?: { name: string; message: string; line?: number };
  limit?: string;
  pending?: { callId: string; seq: number; fn: string; input: unknown }[];
  logs: { level: string; text: string }[];
  calls: { seq: number; fn: string; ok: boolean; decision?: string }[];
  stats: { ms: number; opsUsed: number; logsDropped: number };
};

export interface RunOpts {
  approval?: 'deny' | 'pause-approve' | 'pause-reject' | 'pause-slow' | 'collect' | 'collect-auto' | 'collect-reject';
  caps?: Record<string, number>;
  values?: 'file' | Record<string, unknown>;
  abortAfter?: number;
  resumeWith?: unknown;
  root?: string;
}

export async function openHost(page: Page, host: 'none' | 'strict' | 'lax' | 'lax-noblob' = 'none'): Promise<void> {
  await page.goto(`/host-${host}.html`);
  await page.waitForFunction(() => (window as unknown as { __harnessReady?: boolean }).__harnessReady === true);
}

export async function create(page: Page, name: string, frame: string, opts: Record<string, unknown> = {}): Promise<{ state: string; error?: { name: string; message: string } }> {
  return page.evaluate(([n, f, o]) => (window as unknown as { harness: { create: (n: string, f: string, o: unknown) => Promise<never> } }).harness.create(n, f, o), [name, frame, opts] as const);
}

export async function run(page: Page, name: string, code: string, opts: RunOpts = {}): Promise<Stripped> {
  return page.evaluate(([n, c, o]) => (window as unknown as { harness: { run: (n: string, c: string, o: unknown) => Promise<never> } }).harness.run(n, c, o), [name, code, opts] as const);
}

export async function resume(page: Page, decisions: unknown): Promise<Stripped> {
  return page.evaluate((d) => (window as unknown as { harness: { resume: (d: unknown) => Promise<never> } }).harness.resume(d), decisions);
}

export async function hits(page: Page): Promise<{ del: number; count: number; slowStarted: number }> {
  return page.evaluate(() => (window as unknown as { harness: { hits: never } }).harness.hits);
}

/** A sandbox in url mode on the given host, ready. */
export async function ready(page: Page, host: 'none' | 'strict' | 'lax' = 'none', frame = '/sandbox'): Promise<void> {
  await openHost(page, host);
  const r = await create(page, 's', frame, { caps: { busyMs: 1500 } });
  expect(r.state).toBe('ready');
}

export async function serverRequests(page: Page): Promise<string[]> {
  return page.evaluate(() => fetch('/__requests').then((r) => r.json()));
}
