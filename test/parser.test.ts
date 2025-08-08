import { describe, expect, it } from 'vitest';
import {
  consumeSSEStream,
  createSSEParser,
  type ByteReadableStream,
  type SSEEvent,
} from '../src/parser';

const collect = () => {
  const events: SSEEvent[] = [];
  const onEvent = (e: SSEEvent) => events.push(e);
  return { events, onEvent };
};

describe('createSSEParser', () => {
  it('emits a basic message event with data', () => {
    const { events, onEvent } = collect();
    const p = createSSEParser(onEvent);

    p.feedText('data: hello\n\n');

    expect(events).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('joins multiple data lines with \n', () => {
    const { events, onEvent } = collect();
    const p = createSSEParser(onEvent);

    p.feedText('data: one\n');
    p.feedText('data: two\n');
    p.feedText('\n');

    expect(events).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });

  it('supports custom event type, id and retry', () => {
    const { events, onEvent } = collect();
    const p = createSSEParser(onEvent);

    p.feedText('event: ping\n');
    p.feedText('id: 42\n');
    p.feedText('retry: 1000\n');
    p.feedText('data: ok\n\n');

    expect(events).toEqual([
      { event: 'ping', id: '42', retry: 1000, data: 'ok' },
    ]);
  });

  it('ignores comments and preserves trailing carry for partial chunks', () => {
    const { events, onEvent } = collect();
    const p = createSSEParser(onEvent);

    p.feedText(': comment\n');
    p.feedText('data: hel');
    p.feedText('lo\n');
    p.feedText('\n');

    expect(events).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('normalizes CRLF to \n', () => {
    const { events, onEvent } = collect();
    const p = createSSEParser(onEvent);

    p.feedText('data: a\r\n');
    p.feedText('data: b\r\n');
    p.feedText('\r\n');

    expect(events).toEqual([{ event: 'message', data: 'a\nb' }]);
  });

  it('ignores invalid retry values', () => {
    const { events, onEvent } = collect();
    const p = createSSEParser(onEvent);

    p.feedText('retry: nope\n');
    p.feedText('data: x\n\n');

    expect(events).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('treats field without colon as key with empty value per spec', () => {
    const { events, onEvent } = collect();
    const p = createSSEParser(onEvent);

    p.feedText('data\n');
    p.feedText('\n');

    expect(events).toEqual([{ event: 'message', data: '' }]);
  });
});

describe('consumeSSEStream', () => {
  function makeStream(chunks: Array<Uint8Array | undefined>) {
    let i = 0;
    const reader = {
      async read(): Promise<{ value?: Uint8Array; done: boolean }> {
        if (i >= chunks.length) return { done: true } as const;
        const value = chunks[i++];
        if (!value) return { done: true } as const;
        return { value, done: false } as const;
      },
      releaseLock() {
        // noop
      },
    };
    const body: ByteReadableStream = {
      getReader: () => reader,
    };
    return body;
  }

  it('consumes bytes and emits events', async () => {
    const { events, onEvent } = collect();

    const body = makeStream([
      new TextEncoder().encode('data: a\n'),
      new TextEncoder().encode('data: b\n\n'),
      undefined,
    ]);

    await consumeSSEStream(body, onEvent);

    expect(events).toEqual([{ event: 'message', data: 'a\nb' }]);
  });

  it('handles empty stream gracefully', async () => {
    const { events, onEvent } = collect();
    const body = makeStream([undefined]);

    await consumeSSEStream(body, onEvent);

    expect(events).toEqual([]);
  });
});
