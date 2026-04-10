import { ArrowLeft, FlaskConical } from "lucide-react";
import Link from "next/link";

export default function YmsePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-terra px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-meadow hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbake til forsiden
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-sm text-foreground/70">
            <FlaskConical className="h-4 w-4 text-terra" />
            Ymse prøving og feiling
          </div>
        </div>
      </div>

      <section className="px-6 py-20 md:py-28">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter leading-tight text-foreground">
            Ymse prøving og feiling
          </h1>
        </div>
      </section>

      <section className="px-6 pb-20 md:pb-28">
        <div className="max-w-4xl mx-auto rounded-[2rem] border border-foreground/10 bg-background shadow-sm p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-5">
            Eksperimenter og småprosjekter
          </h2>
          <p className="text-base md:text-lg leading-relaxed text-foreground/85">
            Her kan du samle idéer, prototyper og små tester som er under
            utvikling. Siden egner seg godt til notater om hva som fungerer,
            hva som bør justeres, og hva du vil utforske videre.
          </p>
          <p className="mt-4 text-base md:text-lg leading-relaxed text-foreground/85">
            Bruk denne seksjonen som en kreativ arbeidsflate for læring, raske
            iterasjoner og nye konsepter du vil bygge ut over tid.
          </p>
        </div>
      </section>
    </main>
  );
}
