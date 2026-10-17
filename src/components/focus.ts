export function rememberTrigger() {
  if (document.activeElement instanceof HTMLElement)
    document.activeElement.dataset.drawerReturn = 'true';
}
