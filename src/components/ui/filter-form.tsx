"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { cn } from "cn";

const TYPING_DELAY_MS = 300;

type NamedField = HTMLInputElement | HTMLSelectElement;

// A search form that applies itself: dropdowns as soon as they change, typing after a short pause.
// Without JavaScript it is still a plain GET form, so Enter in the search box works.
export function FilterForm({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const typing = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(typing.current), []);

  // Fields are uncontrolled, so a link to this page without a filter (Clear, the nav) would leave
  // the old value showing next to the unfiltered list.
  useEffect(() => {
    const fields = formRef.current?.querySelectorAll<NamedField>("input[name], select[name]") ?? [];
    for (const field of fields) {
      if (field !== document.activeElement && !searchParams.has(field.name)) field.value = "";
    }
  }, [searchParams]);

  function apply(form: HTMLFormElement) {
    clearTimeout(typing.current);
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === "string" && value.trim()) params.set(name, value.trim());
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return (
    <form
      ref={formRef}
      role="search"
      className={cn(className)}
      onChange={(e) => {
        const form = e.currentTarget;
        clearTimeout(typing.current);
        if (e.target instanceof HTMLSelectElement) apply(form);
        else typing.current = setTimeout(() => apply(form), TYPING_DELAY_MS);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
