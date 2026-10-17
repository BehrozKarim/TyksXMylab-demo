import { DemoEngine, DemoError, type DemoData, exportCsv } from './engine';

let engine: Promise<DemoEngine> | undefined;
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    path: string;
    params: Record<string, unknown>;
    method: string;
    body: Record<string, unknown>;
    restore: { stage?: number; manifest?: string };
  }>,
) => {
  const { id, path, params, method, body, restore } = event.data;
  try {
    engine ??= fetch(`${import.meta.env.BASE_URL}data/demo-v1.json`).then(async (response) => {
      if (!response.ok)
        throw new Error('Could not load the bundled synthetic dataset. Reload to retry.');
      const data: DemoData = await response.json();
      return new DemoEngine(
        data,
        restore.manifest === data.manifest.manifest_id ? restore.stage : 0,
      );
    });
    const service = await engine;
    let result = service.request(path, params, method, body);
    if (path.endsWith('/export') && params.format === 'csv') result = exportCsv(result);
    self.postMessage({
      id,
      result,
      stage: service.stage,
      manifest: service.data.manifest.manifest_id,
      changed: path === '/demo/next' || path === '/demo/reset',
    });
  } catch (error) {
    self.postMessage({
      id,
      error: {
        message: error instanceof Error ? error.message : String(error),
        status: error instanceof DemoError ? error.status : 500,
        code: error instanceof DemoError ? error.code : 'demo_unavailable',
      },
    });
  }
};
