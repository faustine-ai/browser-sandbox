/**
 * What the try-out page starts with. The functions are the host side (they
 * run in the page, as in a real integration, here against mocked data); the
 * examples are the code "the agent wrote", one per thing worth seeing.
 */

export const FUNCTIONS_SOURCE = `// Host side: these run in the page, with the page's session. The sandboxed
// code can call them as sdk.<name>(input) and nothing else.
// In scope here: defineFunctions, log(...) (prints below as "host"), sleep(ms).

const orders = [
  { id: 'ord_8f21', customer: 'Acme Corp', total: 180, status: 'open' },
  { id: 'ord_8f3a', customer: 'Globex', total: 42, status: 'open' },
  { id: 'ord_9012', customer: 'Initech', total: 310, status: 'open' },
  { id: 'ord_77c0', customer: 'Acme Corp', total: 95, status: 'shipped' },
];

return defineFunctions({
  'orders.list': async ({ status } = {}) => {
    log('orders.list', status ?? 'all');
    await sleep(120); // pretend this is an HTTP call
    return orders.filter((o) => !status || o.status === status);
  },

  'orders.get': ({ id }) => orders.find((o) => o.id === id) ?? null,

  'orders.cancel': {
    call: ({ id }) => {
      log('cancelling', id);
      return { id, status: 'cancelled' };
    },
    approval: true,
    description: 'Cancels an order. Cannot be undone.',
  },

  'util.sum': { call: (...nums) => nums.reduce((a, b) => a + b, 0), positional: true },

  help: () => 'Try sdk.orders.list({ status: "open" })',
});
`;

export type Example = { id: string; label: string; hint: string; code: string };

export const EXAMPLES: Example[] = [
  {
    id: "read",
    label: "Read and filter",
    hint: "Calls a function, logs, returns a value. The happy path.",
    code: `// Agent side: runs in the Worker as the body of an async function.
// \`sdk\` is the tree defined on the left; \`console\` is captured. Nothing else is here.

const open = await sdk.orders.list({ status: 'open' });
console.log(\`\${open.length} open orders\`);

const big = open.filter((o) => o.total > 100);
console.info('over 100:', big.map((o) => o.id));

return big.map((o) => ({ id: o.id, customer: o.customer, total: o.total }));
`,
  },
  {
    id: "approval",
    label: "Approval",
    hint: "orders.cancel is marked approval: true. Switch the mode above the Run button and compare.",
    code: `// orders.cancel requires approval. With "deny" the first cancel throws
// ApprovalRejected; with "pause" you decide per call while the run waits;
// with "collect" the run is cut, you see every cancel at once, then it is
// replayed with your decisions.

const open = await sdk.orders.list({ status: 'open' });
const big = open.filter((o) => o.total > 100);
for (const o of big) await sdk.orders.cancel({ id: o.id });
console.log('cancelled', big.length);
return { cancelled: big.map((o) => o.id) };
`,
  },
  {
    id: "busy",
    label: "Busy loop",
    hint: "A loop with no call in flight. The watchdog terminates the worker; nothing to hope for.",
    code: `// The busy-loop watchdog ends this in a few seconds (busyMs). The worker is
// terminated, not asked nicely. The status is "limit", the limit is "busy".

let n = 0;
while (true) n++;
`,
  },
  {
    id: "ops",
    label: "Too many calls",
    hint: "maxOps caps the function calls of one run; the rest never reach the page.",
    code: `// Each call is counted at the bridge. Past maxOps (50 on this page) the run
// ends with limit "ops" — the page never sees call 51.

let total = 0;
for (let i = 0; i < 500; i++) {
  total = await sdk.util.sum(total, i);
}
return total;
`,
  },
  {
    id: "escape",
    label: "Escape attempts",
    hint: "What the code finds when it looks for the network, the DOM or storage.",
    code: `// What is there, really? Every probe below is something the code would
// need to reach your page, your API or your storage.

const probes = {
  fetch: typeof fetch,
  XMLHttpRequest: typeof XMLHttpRequest,
  WebSocket: typeof WebSocket,
  importScripts: typeof importScripts,
  window: typeof window,
  document: typeof document,
  localStorage: typeof localStorage,
  indexedDB: typeof indexedDB,
  cookie: typeof globalThis.cookie,
};

try {
  await fetch('https://example.com/');
  probes.fetchCall = 'reached the network';
} catch (e) {
  probes.fetchCall = String(e);
}

try {
  await sdk.orders.remove({ id: 'ord_8f21' }); // not in the map
} catch (e) {
  probes.unknownFunction = String(e);
}

console.log(probes);
return probes;
`,
  },
  {
    id: "error",
    label: "A thrown error",
    hint: "Errors come back with the name, the message and the line, worded for a model.",
    code: `// A plain bug: the order does not exist and the code does not check.
// The result is status "error" with the line where it happened.

const order = await sdk.orders.get({ id: 'ord_0000' });
console.log('found', order);
return order.total.toFixed(2);
`,
  },
];
