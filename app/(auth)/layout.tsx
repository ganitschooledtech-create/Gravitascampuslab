import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6"><Logo /></div>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 max-w-md text-center text-xs text-muted">
        Gravitas Campus, Gadag · No ads, no trackers. <a href="/privacy">Privacy</a>
      </p>
    </main>
  );
}
