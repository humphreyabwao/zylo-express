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

/**
 * Reads a key from `sessionStorage`, returning `null` during the server render
 * so hydration cannot mismatch. The value is read once per page life — nothing
 * in the app writes to these keys while a reader is mounted.
 */
export function useSessionValue(key: string) {
  return useSyncExternalStore(
    noop,
    () => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null
  );
}
