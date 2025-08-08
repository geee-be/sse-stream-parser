# @geee-be/sse-stream-parser

Tiny, zero-dependency Server-Sent Events (SSE) stream parser for browsers and Node.js. Feed it chunks from a streaming response and get normalized SSE events back.

- Minimal and fast: no deps, one small function
- Handles multiline data, comments, and CRLF normalization
- Works with Web Streams (`ReadableStream`) via `getReader()` and with strings

## Install

```sh
# pnpm (recommended)
pnpm add @geee-be/sse-stream-parser

# npm
npm i @geee-be/sse-stream-parser

# yarn
yarn add @geee-be/sse-stream-parser
```

## Quick start

### Browser (fetch streaming)

```ts
import { createSSEParser } from '@geee-be/sse-stream-parser';

const parser = createSSEParser((e) => {
  console.log('event:', e.event); // e.g. "message" (default) or custom type
  console.log('data:', e.data);
  console.log('id:', e.id);
  console.log('retry:', e.retry);
});

const res = await fetch('/sse-endpoint');
if (!res.body) throw new Error('No body');

const reader = res.body.getReader();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  if (value) parser.feedBytes(value);
}
parser.finish();
```

### Node.js (v18+ with global fetch)

```ts
import { createSSEParser } from '@geee-be/sse-stream-parser';

const parser = createSSEParser((e) => {
  // handle event
});

const res = await fetch('https://example.com/sse');
if (!res.body) throw new Error('No body');

const reader = res.body.getReader();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  if (value) parser.feedBytes(value);
}
parser.finish();
```

If you already have text (not bytes), you can call `parser.feedText(str)` instead.

### Convenience helper: consumeSSEStream

If you have a `Response` and want a simple one-liner, use the built-in stream consumer:

```ts
import { consumeSSEStream } from '@geee-be/sse-stream-parser';

const res = await fetch('https://example.com/sse');
if (!res.body) throw new Error('No body');

await consumeSSEStream(res.body, (e) => {
  console.log(e.event, e.data);
});
```

## API

### createSSEParser(onEvent)

Creates a parser instance.

- Input
  - `onEvent: (e: SSEEvent) => void` — called whenever a complete SSE message (double-newline terminated) is parsed
- Output
  - Returns an object: `{ feedBytes(chunk: Uint8Array), feedText(text: string), finish(): void }`

#### SSEEvent shape

```ts
type SSEEvent = {
  event?: string; // defaults to 'message' when not provided in the block
  data: string;   // joined with "\n" across multiple data: lines
  id?: string;    // set only if the block contained an id: field
  retry?: number; // set only if the block contained a retry: field (parsed as base-10 integer)
};
```

### Behavior details

- Lines are normalized: `\r\n` becomes `\n`.
- Comment lines (starting with `:`) are ignored.
- Each `data:` line appends to the current event payload. The final `data` value is the `\n`-joined result.
- An empty line (`""`) ends the current event and triggers `onEvent`.
- `event:` sets the event type (defaults to `"message"` if not present).
- `id:` sets the event ID for the current event only.
- `retry:` is parsed as an integer; invalid numbers are ignored.

Note: This parser does not persist `id` or `retry` values across events. They only appear on the event when explicitly present in that event block.

## Why use this?

- You want to consume SSE streams without `EventSource`, e.g., custom auth/headers or Node.js environments.
- You already have a byte stream from `fetch` and want a small, well-typed parser to turn it into events.

## Examples

### From a string buffer

```ts
import { createSSEParser } from '@geee-be/sse-stream-parser';

const out: any[] = [];
const parser = createSSEParser((e) => out.push(e));

parser.feedText('event: ping\n');
parser.feedText('data: one\n');
parser.feedText('data: two\n');
parser.feedText('\n'); // end of event

// out[0] -> { event: 'ping', data: 'one\ntwo' }
```

## TypeScript

The source is TypeScript and fully typed. Import it in TS or JS projects:

```ts
import { createSSEParser } from '@geee-be/sse-stream-parser';
```

## Limitations

- This is a low-level parser for SSE wire format. It does not handle reconnects, backoff, or auto-retry.
- `finish()` is currently a no-op; it exists for symmetry and future extension.

## Development and releasing (Changesets)

Use Changesets to track changes and publish.

- Prereqs
  - Node 20+, pnpm installed
  - NPM publishing token configured in GitHub repo secrets as `NPM_TOKEN`
  - Default branch is `main`

- Local dev
  - Install: `pnpm install`
  - Build: `pnpm build`
  - Test: `pnpm test`

- Record a change
  - Run: `pnpm changeset`
  - Choose bump type (patch/minor/major), write a short summary
  - Commit the generated file under `.changeset/` along with your code changes

- CI and releases
  - On push/PR to `main`, CI builds and tests
  - After merging feature PRs, the Release workflow opens/updates a “Version Packages” PR
  - Merge that PR to publish to npm (uses `NPM_TOKEN`); versions and changelog are committed automatically

- Manual release (optional)
  - Version packages and build: `pnpm version`
  - Publish to npm: `pnpm release`

## License

MIT © Contributors
