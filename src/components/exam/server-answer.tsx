"use client";

import { createContext, useContext } from "react";

/**
 * For question types whose answer the server writes (an uploaded file): which
 * attempt item this renderer is, and how to tell the runner a new answer was
 * saved without sending it through the browser autosave.
 */
export interface ServerAnswer {
  attemptId: string;
  itemId: string;
  onSaved: (value: unknown) => void;
}

const Ctx = createContext<ServerAnswer | null>(null);
export const ServerAnswerProvider = Ctx.Provider;
export const useServerAnswer = () => useContext(Ctx);
