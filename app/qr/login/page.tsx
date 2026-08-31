import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

export default async function QrLoginPage({ searchParams }: PageProps) {
  const { callbackUrl, error } = await searchParams;

  async function login(formData: FormData) {
    "use server";

    const redirectTo = String(formData.get("callbackUrl") ?? "/qr");

    try {
      await signIn("credentials", {
        ...Object.fromEntries(formData),
        redirectTo,
      });
    } catch (signInError) {
      if (signInError instanceof AuthError) {
        redirect(`/qr/login?error=1&callbackUrl=${encodeURIComponent(redirectTo)}`);
      }
      throw signInError;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6"
        >
          <ArrowLeft size={16} />
          Til forsiden
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">QR-administrasjon</h1>
        <p className="text-sm text-slate-500 mb-6">Logg inn for å administrere QR-koder.</p>

        {error ? (
          <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            Feil passord. Prøv igjen.
          </p>
        ) : null}

        <form action={login} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/qr"} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Passord</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-xl bg-slate-900 text-white font-semibold py-3 hover:bg-slate-800 transition-colors"
          >
            Logg inn
          </button>
        </form>
      </div>
    </div>
  );
}
