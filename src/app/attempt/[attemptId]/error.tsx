"use client";

import { type ErrorProps, ErrorState } from "@/components/shell/error-state";

// The exam screen has no shell, so it gets its own boundary: the student needs
// to hear first that their answers are safe, and a way back that isn't "home".
export default function AttemptError(props: ErrorProps) {
  return (
    <main id="main" className="px-4">
      <ErrorState {...props} message="Your answers so far are saved on the server, and your time is kept by the server too." back={{ href: "/", label: "Your exams" }} />
    </main>
  );
}
