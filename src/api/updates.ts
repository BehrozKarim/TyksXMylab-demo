import { API_BASE } from './client';
import { backendStateSchema } from './backend';

/** Notifications are refresh signals, never authoritative active-state replacements.
 * EventSource retains Last-Event-ID across its automatic reconnects.
 */
export function subscribeToUpdates(refresh: () => void, connection: (connected: boolean) => void) {
  if (typeof EventSource === 'undefined') return () => {};
  const source = new EventSource(`${API_BASE}/updates`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      refresh();
    }, 150);
  };
  source.onopen = () => {
    connection(true);
    schedule();
  };
  source.onerror = () => connection(false);
  source.addEventListener('state', (event) => {
    try {
      if (backendStateSchema.safeParse(JSON.parse((event as MessageEvent<string>).data)).success)
        schedule();
    } catch {
      // A malformed notification cannot replace a validated state; polling still recovers.
    }
  });
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    source.close();
  };
}
