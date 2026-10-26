// The function tree the code calls: `sdk.books.listBooks(input)`. Plain
// frozen objects built from the names the host sent, each leaf a function
// that sends a `call`. A name that is both a leaf and a branch is a function
// with children.

export type Caller = (fn: string, input: unknown) => Promise<unknown>;

export function buildTree(names: readonly string[], call: Caller, positional: ReadonlySet<string> = new Set()): Record<string, unknown> {
  type Node = { children: Map<string, Node>; leaf?: string };
  const root: Node = { children: new Map() };
  for (const name of names) {
    let node = root;
    for (const part of name.split('.')) {
      let next = node.children.get(part);
      if (!next) {
        next = { children: new Map() };
        node.children.set(part, next);
      }
      node = next;
    }
    node.leaf = name;
  }
  const materialise = (node: Node): unknown => {
    const value: Record<string, unknown> = node.leaf !== undefined ? leafFor(node.leaf, call, positional.has(node.leaf)) : Object.create(null);
    for (const [key, child] of node.children) value[key] = materialise(child);
    return Object.freeze(value);
  };
  return materialise(root) as Record<string, unknown>;
}

function leafFor(name: string, call: Caller, positional: boolean): Record<string, unknown> {
  const fn = positional ? (...args: unknown[]) => call(name, args) : (input: unknown) => call(name, input);
  Object.defineProperty(fn, 'name', { value: name.slice(name.lastIndexOf('.') + 1) });
  return fn as unknown as Record<string, unknown>;
}
