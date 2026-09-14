import { useLayoutEffect, useRef, type RefObject } from "react";

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, summary, [tabindex]',
  )).filter((element) => {
    if (element.tabIndex < 0 || element.matches(':disabled')) return false;
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (current.hidden || current.inert || style.display === 'none' || style.visibility === 'hidden') return false;
      if (current.tagName === 'DETAILS' && !current.hasAttribute('open') &&
        !current.querySelector('summary')?.contains(element)) return false;
      if (current === container) break;
    }
    return true;
  });
}

/** Keep keyboard interaction in the topmost modal, including nested confirmations. */
export function useModalFocus(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useLayoutEffect(() => {
    const container = ref.current;
    if (!open || !container) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isTopModal = () => Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1) === container;
    const focusFirst = () => (focusableElements(container)[0] ?? container).focus();
    if (isTopModal()) focusFirst();

    const onFocus = (event: FocusEvent) => {
      if (isTopModal() && !container.contains(event.target as Node)) focusFirst();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopModal()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements(container);
      const first = elements[0] ?? container;
      const last = elements.at(-1) ?? container;
      if (!container.contains(document.activeElement) || document.activeElement === container ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, ref]);
}
