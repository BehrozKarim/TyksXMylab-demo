export function notifyExport(format: string) {
  window.dispatchEvent(
    new CustomEvent('ward-evidence-exported', {
      detail: `Snapshot downloaded · ${format.toUpperCase()}`,
    }),
  );
}
