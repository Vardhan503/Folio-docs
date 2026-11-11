import type { Metadata } from "next";
import { LoginForm } from "@/app/login/LoginForm";
import { SessionBoundary } from "@/components/auth/SessionBoundary";
import { FolioLogo } from "@/components/layout/FolioLogo";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <SessionBoundary userId={null} />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <FolioLogo linked={false} />
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(28,27,25,0.04)] sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Sign in to Folio
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Use the email and password provided for your account.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-subtle">
          Accounts are created by an administrator. Self-service sign-up is not
          available.
        </p>
      </div>
    </main>
  );
}
