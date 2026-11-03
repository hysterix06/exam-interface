import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Exam</h1>
        <p className="mb-8 text-sm text-muted-foreground">Sign in to continue.</p>
        <LoginForm />
      </div>
    </main>
  );
}
