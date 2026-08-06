"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * True once the client has taken over from the server render.
 *
 * Uses `useSyncExternalStore` rather than a mount effect so nothing sets state
 * synchronously inside an effect — React switches from the server snapshot to
 * the client one as part of hydration instead of scheduling an extra render.
 */
export function useHydrated() {
  return useSyncExternalStore(noop, onClient, onServer);
}

// `useSessionValue` lived here to read the order snapshot the checkout wrote
// before redirecting to the confirmation. That snapshot is gone: payments now
// leave the site and come back, so the confirmation is rendered from the order
// row on the server instead of from anything the browser was holding.
