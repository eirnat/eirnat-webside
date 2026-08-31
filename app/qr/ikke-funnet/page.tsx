import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function QrNotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Lenken finnes ikke</h1>
        <p className="text-slate-600 mb-6">
          Denne QR-koden er ikke gyldig, eller den er ikke lenger aktiv.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft size={16} />
          Gå til eirnat.no
        </Link>
      </div>
    </div>
  );
}
