export type SSEEvent = {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
};

type State = Readonly<{
  carry: string;
  curEvent?: string;
  curId?: string;
  curRetry?: number;
  dataLines: readonly string[];
}>;

const initialState: State = { carry: '', dataLines: [] } as const;

const parseSSEField = (line: string): [string, string] => {
  const idx = line.indexOf(':');
  return idx === -1
    ? [line, '']
    : [line.slice(0, idx), line.slice(idx + 1).replace(/^ /, '')];
};

/** Pure helper: apply a single SSE field to state. */
const applyField = (s: State, field: string, value: string): State =>
  field === 'event'
    ? { ...s, curEvent: value }
    : field === 'data'
      ? { ...s, dataLines: [...s.dataLines, value] }
      : field === 'id'
        ? { ...s, curId: value }
        : field === 'retry'
          ? (() => {
              const n = Number.parseInt(value, 10);
              return Number.isNaN(n) ? s : { ...s, curRetry: n };
            })()
          : s;

/**
 * Creates a Server-Sent Events (SSE) parser that processes incoming SSE data streams.
 */
export const createSSEParser = (onEvent: (e: SSEEvent) => void) => {
  const ref = { current: initialState };
  const decoder = new TextDecoder();

  const emit = () => {
    const s = ref.current;
    onEvent({
      event: s.curEvent ?? 'message',
      data: s.dataLines.join('\n'),
      id: s.curId,
      retry: s.curRetry,
    });
    // fresh state after emitting (immutable swap)
    ref.current = { carry: s.carry, dataLines: [] };
  };

  /** Refactored: tiny, linear, and boring (in the good way). */
  const processLine = (line: string) =>
    line === ''
      ? emit()
      : line.startsWith(':')
        ? undefined
        : (() => {
            const [field, value] = parseSSEField(line);
            ref.current = applyField(ref.current, field, value);
          })();

  const feedText = (text: string) => {
    const s = ref.current;
    const normalized = (s.carry + text).replace(/\r\n/g, '\n');
    const parts = normalized.split('\n');
    const lines = parts.slice(0, -1);
    const tail = parts[parts.length - 1] ?? '';
    lines.forEach(processLine);
    ref.current = { ...ref.current, carry: tail };
  };

  return {
    feedBytes: (chunk: Uint8Array) =>
      feedText(decoder.decode(chunk, { stream: true })),
    feedText,
    finish: () => {},
  };
};

// Structural type to avoid requiring DOM lib typings
export type ByteReadableStream = {
  getReader(): {
    read(): Promise<{ value?: Uint8Array; done: boolean }>;
    releaseLock?: () => void;
  };
};

/**
 * Convenience helper: consume a WHATWG ReadableStream of Uint8Array (e.g., Response.body)
 * and emit SSE events via the provided callback.
 */
export async function consumeSSEStream(
  body: ByteReadableStream,
  onEvent: (e: SSEEvent) => void,
  onComplete?: () => void,
): Promise<void> {
  const parser = createSSEParser(onEvent);
  const reader = body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) parser.feedBytes(value);
    }
  } finally {
    parser.finish();
    reader.releaseLock?.();
    onComplete?.();
  }
}
