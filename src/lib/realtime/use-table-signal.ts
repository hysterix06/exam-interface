"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type ChannelStatus, debounce, pollDelay } from "./signal";

/**
 * Call `onSignal` when rows of `table` matching `filter` change (Supabase
 * Realtime, filtered by the viewer's own RLS), and also on a safety poll:
 * every 30 s while connected, every `fallbackMs` when not. Hidden tabs skip
 * the poll. The payload is ignored on purpose: the caller refetches through
 * the server, which stays the source of truth.
 */
export function useTableSignal({
  table,
  filter,
  onSignal,
  fallbackMs = 5_000,
  connectedMs = 30_000,
  debounceMs = 400,
  enabled = true,
}: {
  table: "exams" | "attempts";
  filter?: string;
  onSignal: () => void;
  fallbackMs?: number;
  connectedMs?: number;
  /** Changes within this window collapse into one signal. */
  debounceMs?: number;
  enabled?: boolean;
}) {
  const [status, setStatus] = useState<ChannelStatus>("connecting");
  const latest = useRef(onSignal);
  useEffect(() => {
    latest.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    const fire = debounce(() => latest.current(), debounceMs);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let live = true;
    // A session restored from cookies isn't handed to Realtime on its own; without
    // the user's token the channel joins as anonymous and RLS filters out every
    // change. Set it first, and again whenever the token is refreshed.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void supabase.realtime.setAuth(session.access_token);
    });
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!live) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`${table}:${filter ?? "all"}:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, () => fire())
        .subscribe((s) => setStatus(s as ChannelStatus));
    });
    return () => {
      live = false;
      fire.cancel();
      sub.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [table, filter, enabled, debounceMs]);

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") latest.current();
    }, pollDelay(status, { fallbackMs, connectedMs }));
    return () => clearInterval(t);
  }, [status, fallbackMs, connectedMs, enabled]);

  return status;
}
