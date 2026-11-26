/** Browser-only operations; importing this module does not read the DOM. */
const focusableSelector =
  'a[href], area[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"], audio[controls], video[controls]';

function focusableControls(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => {
    if (
      element.tabIndex < 0 ||
      element.matches(':disabled, input[type="hidden"]') ||
      element.closest('[hidden], [inert], [aria-hidden="true"]') ||
      !element.getClientRects().length
    )
      return false;
    const visibility = element.ownerDocument.defaultView?.getComputedStyle(element).visibility;
    return visibility !== 'hidden' && visibility !== 'collapse';
  });
}

type TabEvent = {
  key: string;
  shiftKey: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
};

/** Wrap a modal's Tab boundary. Callers own opening, closing, Escape and initial focus. */
export function containTabFocus(event: TabEvent, container: HTMLElement | null): void {
  if (!container || event.key !== 'Tab' || event.defaultPrevented) return;
  const controls = focusableControls(container);
  const active = container.ownerDocument.activeElement;
  const first = controls[0];
  const last = controls.at(-1);
  if (!first) {
    event.preventDefault();
    container.focus();
  } else if (!container.contains(active) || active === container || !controls.includes(active as HTMLElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function restoreFocus(element: HTMLElement | null): void {
  if (element?.isConnected && !element.closest('[hidden], [inert]')) element.focus();
}
