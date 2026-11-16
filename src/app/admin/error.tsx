"use client";

import { type ErrorProps, ErrorState } from "@/components/shell/error-state";

export default function Error(props: ErrorProps) {
  return <ErrorState {...props} />;
}
