const STORAGE_KEY = 'ward-evidence-standalone-v1';
export const DEMO_UPDATE = 'ward-evidence-demo-update';
let worker: Worker | undefined;
let serial = 0;
type Reply = {
  id: number;
  result?: unknown;
  stage: number;
  manifest: string;
  changed: boolean;
  error?: { message: string; status: number; code: string };
};
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; cleanup: () => void }
>();
export class LocalRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./demo.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const reply = event.data,
      request = pending.get(reply.id);
    // Persist successful mutations even if their view was closed meanwhile.
    if (!reply.error) {
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ stage: reply.stage, manifest: reply.manifest }),
        );
      } catch {
        /* Private/blocked storage: demo still works for the current page. */
      }
      if (reply.changed) window.dispatchEvent(new Event(DEMO_UPDATE));
    }
    if (!request) return;
    pending.delete(reply.id);
    request.cleanup();
    if (reply.error)
      request.reject(
        new LocalRequestError(reply.error.message, reply.error.status, reply.error.code),
      );
    else request.resolve(reply.result);
  };
  worker.onerror = () => {
    for (const request of pending.values()) {
      request.cleanup();
      request.reject(new Error('Demo worker stopped. Reload to restart.'));
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}
export function localRequest(
  path: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
  method = 'GET',
  body: unknown = {},
): Promise<unknown> {
  signal?.throwIfAborted();
  const activeWorker = getWorker(),
    id = ++serial;
  let restore = {};
  try {
    restore = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    /* No saved state. */
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    pending.set(id, {
      resolve,
      reject,
      cleanup: () => signal?.removeEventListener('abort', abort),
    });
    signal?.addEventListener('abort', abort, { once: true });
    activeWorker.postMessage({ id, path, params, method, body: body ?? {}, restore });
  });
}
