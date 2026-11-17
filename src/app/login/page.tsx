import { LogoMark } from "@/components/shell/logo";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <LogoMark className="mb-8 size-7" />
        <h1 className="font-serif text-[1.875rem] leading-tight font-semibold tracking-tight">Sign in to Modus</h1>
        <p className="mt-2 mb-10 text-[0.9375rem] text-muted-foreground">
          Exams you can reason about: every question reproducible, every score explained.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
