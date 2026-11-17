"use client";

import { useEffect, useState } from "react";
import { ensureTypesReady } from "./registry";

/** True once every type's async setup (the code sandbox) has loaded in this browser. */
export function useTypesReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void ensureTypesReady().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}
