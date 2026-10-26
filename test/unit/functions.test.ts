import { describe, expect, it } from 'vitest';
import { defineFunctions, fromObject, isFunctionName } from '../../src/functions/define';
import { describe as describeFns } from '../../src/functions/describe';

describe('defineFunctions', () => {
  it('accepts functions and entries, rejects bad names and missing calls', () => {
    const f = defineFunctions({ a: () => 1, 'b.c': { call: () => 2, approval: true, description: 'd' } });
    expect(Object.keys(f)).toEqual(['a', 'b.c']);
    expect(f['b.c']).toMatchObject({ approval: true, description: 'd' });
    expect(Object.isFrozen(f)).toBe(true);
    expect(() => defineFunctions({ 'a..b': () => 1 })).toThrow(/Invalid function name/);
    expect(() => defineFunctions({ '__proto__.x': () => 1 })).toThrow(/Invalid function name/);
    expect(() => defineFunctions({ 'a-b': () => 1 })).toThrow(/Invalid function name/);
    expect(() => defineFunctions({ a: { call: 1 as unknown as () => void } })).toThrow(/has no call/);
  });

  it('isFunctionName', () => {
    expect(isFunctionName('a')).toBe(true);
    expect(isFunctionName('a.b_c.$d')).toBe(true);
    expect(isFunctionName('')).toBe(false);
    expect(isFunctionName('a.constructor')).toBe(false);
    expect(isFunctionName('x'.repeat(300))).toBe(false);
    expect(isFunctionName(1 as unknown as string)).toBe(false);
  });
});

describe('fromObject', () => {
  it('resolves dotted names at call time with the right this, marks approval, adds extra', async () => {
    const sdk = {
      books: {
        token: 't',
        list(this: { token: string }, input: unknown) {
          return [this.token, input];
        },
        remove: (i: unknown) => i,
      },
      lazy: undefined as unknown,
    };
    const f = fromObject(sdk, { names: ['books.list', 'books.remove', 'lazy.fn'], approval: (n) => n.endsWith('remove'), descriptions: (n) => (n === 'books.list' ? 'List' : undefined), extra: { help: () => 'h' } });
    expect(await f['books.list']!.call(1)).toEqual(['t', 1]);
    expect(f['books.remove']!.approval).toBe(true);
    expect(f['books.list']!.description).toBe('List');
    expect(f['books.list']!.approval).toBeUndefined();
    expect(f.help!.call(0)).toBe('h');
    expect(() => f['lazy.fn']!.call(0)).toThrow(/not available/);
    sdk.lazy = { fn: () => 'now' };
    expect(f['lazy.fn']!.call(0)).toBe('now');
    expect(() => fromObject(sdk, { names: ['bad name'] })).toThrow(/Invalid function name/);
  });
});

describe('describe', () => {
  const f = defineFunctions({
    'books.list': { call: () => 1, description: 'List books', input: { type: 'object' } },
    'books.remove': { call: () => 1, approval: true },
    help: { call: () => 1, description: 'Help' },
    'help.topics': () => 1,
  });

  it('index format', () => {
    expect(describeFns(f)).toBe(['- sdk.books.list(input) — List books', '- sdk.books.remove(input) (requires approval)', '- sdk.help(input) — Help', '- sdk.help.topics(input)'].join('\n'));
  });

  it('ts format', () => {
    const ts = describeFns(f, { root: 'api', format: 'ts' });
    expect(ts).toContain('declare const api: {');
    expect(ts).toContain('/** List books */');
    expect(ts).toContain('list(input: {"type":"object"}): Promise<unknown>;');
    expect(ts).toContain("/** Requires the user's approval. */");
    expect(ts).toContain('help: ((input?: unknown) => Promise<unknown>) & {');
    expect(ts).toContain('topics(input?: unknown): Promise<unknown>;');
  });
});
