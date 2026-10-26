import type { FunctionMap } from './define';

export interface DescribeOptions {
  /** Name of the tree as the code sees it. Default `sdk`. */
  root?: string;
  /** `index`: one line per function. `ts`: TypeScript stubs. */
  format?: 'index' | 'ts';
}

/** The functions as text for a system prompt, with the names the code will use. */
export function describe(functions: FunctionMap, options: DescribeOptions = {}): string {
  const root = options.root ?? 'sdk';
  const names = Object.keys(functions).sort();
  if ((options.format ?? 'index') === 'index') {
    return names
      .map((n) => {
        const e = functions[n]!;
        const flags = e.approval ? ' (requires approval)' : '';
        return `- ${root}.${n}(${e.positional ? '...args' : 'input'})${flags}${e.description ? ` — ${e.description}` : ''}`;
      })
      .join('\n');
  }
  // ts: a nested declaration
  type Node = { children: Map<string, Node>; leaf?: string };
  const tree: Node = { children: new Map() };
  for (const n of names) {
    let node = tree;
    const parts = n.split('.');
    for (const p of parts) {
      let next = node.children.get(p);
      if (!next) {
        next = { children: new Map() };
        node.children.set(p, next);
      }
      node = next;
    }
    node.leaf = n;
  }
  const lines: string[] = [`declare const ${root}: {`];
  const walk = (node: Node, depth: number) => {
    const pad = '  '.repeat(depth);
    for (const [key, child] of node.children) {
      if (child.leaf !== undefined) {
        const e = functions[child.leaf]!;
        const doc = [e.description, e.approval ? 'Requires the user\'s approval.' : undefined].filter(Boolean).join(' ');
        if (doc) lines.push(`${pad}/** ${doc} */`);
        const input = e.positional ? '...args: unknown[]' : e.input ? `input: ${JSON.stringify(e.input)}` : 'input?: unknown';
        if (child.children.size === 0) lines.push(`${pad}${key}(${input}): Promise<unknown>;`);
        else {
          lines.push(`${pad}${key}: ((${input}) => Promise<unknown>) & {`);
          walk(child, depth + 1);
          lines.push(`${pad}};`);
        }
      } else {
        lines.push(`${pad}${key}: {`);
        walk(child, depth + 1);
        lines.push(`${pad}};`);
      }
    }
  };
  walk(tree, 1);
  lines.push('};');
  return lines.join('\n');
}
