import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function QrPrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link
          href="/qr"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6"
        >
          <ArrowLeft size={16} />
          Tilbake til admin
        </Link>

        <h1 className="text-3xl font-black tracking-tight mb-6">Personvernerklæring — QR-tjenesten</h1>

        <div className="prose prose-slate max-w-none space-y-4 text-slate-700">
          <p>
            Denne tjenesten drives av Eirik Natlandsmyr på eirnat.no. Når du skanner en QR-kode
            som peker til eirnat.no/r/…, registrerer vi en teknisk hendelse for statistikk og
            videresender deg umiddelbart til måladressen.
          </p>

          <h2 className="text-xl font-bold text-slate-900">Hva logges</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Tidspunkt for skanning</li>
            <li>Omtrentlig geografisk plassering (land, region, by) basert på nettverksinformasjon</li>
            <li>Enhetstype (mobil, nettbrett, desktop), operativsystem og nettleser</li>
            <li>En daglig roterende pseudonym (hash) for å skille unike fra gjentatte skanninger</li>
          </ul>

          <h2 className="text-xl font-bold text-slate-900">Hva logges ikke</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>IP-adresse — brukes kun midlertidig for geo-oppslag og hash, lagres aldri</li>
            <li>Informasjonskapsler (cookies) eller localStorage på enheten din</li>
            <li>Personlig identifiserbar informasjon</li>
          </ul>

          <h2 className="text-xl font-bold text-slate-900">Formål</h2>
          <p>
            Statistikken brukes til å forstå hvor og når QR-koder skannes, slik at eier av koden
            kan vurdere effekt av fysisk plassering. Geo-data er upålitelig for mobiltrafikk og
            skal ikke brukes som presis posisjon.
          </p>

          <h2 className="text-xl font-bold text-slate-900">Lagringstid</h2>
          <p>
            Skanningsdata slettes automatisk etter 90 dager. Den daglige pseudonymhashen roterer
            automatisk og kan ikke knyttes tilbake til en person etter 24 timer.
          </p>

          <h2 className="text-xl font-bold text-slate-900">Behandlingsansvarlig</h2>
          <p>
            Eirik Natlandsmyr
            <br />
            eirnat.no
          </p>

          <p className="text-sm text-slate-500 pt-4 border-t border-slate-200">
            Dette er et utkast til gjennomgang. Kontakt behandlingsansvarlig ved spørsmål om
            personvern.
          </p>
        </div>
      </div>
    </div>
  );
}
