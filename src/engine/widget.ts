import { z } from "zod";

// The widget protocol: how an embedded tool talks to the exam. It is three
// messages, all plain JSON, so anyone can build a widget in any framework.
//
//   exam   -> widget   { type: "exam:init", version: 1, state, config, readOnly }
//   widget -> exam     { type: "exam:ready", version: 1 }
//   widget -> exam     { type: "exam:response", version: 1, state }
//
// "state" is whatever the widget wants saved; the exam stores it as the answer
// and hands it back on init (resume, review, answer key).

export const PROTOCOL_VERSION = 1;
/** Largest saved state we accept from a widget, so a misbehaving one can't fill the database. */
export const MAX_STATE_BYTES = 100_000;

export interface WidgetInfo {
  id: string;
  label: string;
  description: string;
  /** Served from our own origin; authors choose from this list, never type a URL. */
  src: string;
}

export const WIDGETS: readonly WidgetInfo[] = [
  {
    id: "pos-demo",
    label: "Point-of-sale demo",
    description: "A small till. The student rings up an order and applies a discount; the widget reports the order and total.",
    src: "/widgets/pos-demo.html",
  },
];

export const widgetById = (id: string) => WIDGETS.find((w) => w.id === id);

const readySchema = z.object({ type: z.literal("exam:ready"), version: z.literal(PROTOCOL_VERSION) });
const responseSchema = z.object({ type: z.literal("exam:response"), version: z.literal(PROTOCOL_VERSION), state: z.unknown() });
const messageSchema = z.union([readySchema, responseSchema]);

export type WidgetMessage = z.infer<typeof messageSchema>;

/** A widget message, or null for anything else (other scripts post messages too). */
export function parseWidgetMessage(data: unknown): WidgetMessage | null {
  const parsed = messageSchema.safeParse(data);
  if (!parsed.success) return null;
  if (parsed.data.type === "exam:response") {
    try {
      if (JSON.stringify(parsed.data.state ?? null).length > MAX_STATE_BYTES) return null;
    } catch {
      return null;
    }
  }
  return parsed.data;
}

export function initMessage(state: unknown, config: unknown, readOnly: boolean) {
  return { type: "exam:init" as const, version: PROTOCOL_VERSION, state: state ?? null, config: config ?? {}, readOnly };
}

/** Read "total" or "order.length" or "lines.0.qty" out of a widget's state. */
export function readPath(state: unknown, path: string): unknown {
  let cur: unknown = state;
  for (const part of path.split(".").filter(Boolean)) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && part === "length") cur = cur.length;
    else if (Array.isArray(cur) && /^\d+$/.test(part)) cur = cur[Number(part)];
    else if (typeof cur === "object" && Object.prototype.hasOwnProperty.call(cur, part)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}
