import { useEffect } from 'react';

// Shared stack so the Android hardware/gesture back button closes whatever
// overlay (drawer, modal, confirm dialog) is currently on top before falling
// back to tab navigation / exiting the app. Components register a handler
// while their overlay is open; App's backButton listener consumes the
// top-most one first.
type Handler = () => void;

const stack: Handler[] = [];

export function pushBackHandler(fn: Handler): () => void {
  stack.push(fn);
  return () => {
    const i = stack.indexOf(fn);
    if (i !== -1) stack.splice(i, 1);
  };
}

export function consumeBackHandler(): boolean {
  const fn = stack[stack.length - 1];
  if (!fn) return false;
  fn();
  return true;
}

// Registers `onBack` as the back-button handler for as long as `active` is
// true (e.g. a modal's open state).
export function useBackHandler(active: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(onBack);
  }, [active, onBack]);
}
