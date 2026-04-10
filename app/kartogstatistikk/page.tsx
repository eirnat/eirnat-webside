import { ArrowLeft, BarChart3 } from "lucide-react";
import Link from "next/link";

const menuItems = [
  {
    title: "Trafikktelling",
    description: "Registrer tellinger og se kart/statistikk for innsamlet trafikkdata.",
    href: "/kartogstatistikk/trafikktelling",
  },
  {
    title: "Lag kart",
    description: "Tegn stengt veg og omkjoring direkte i kartet med verktøy i sidebar.",
    href: "/kartogstatistikk/lag-kart",
  },
];

export default function KartOgStatistikkPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-foreground/10 bg-background/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-terra px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-meadow hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbake til forsiden
          </Link>
          <h1 className="text-lg md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-meadow" />
            Kart og statistikk
          </h1>
        </div>
      </div>

      <section className="px-6 py-14 md:py-20">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <div className="text-meadow font-semibold uppercase tracking-widest mb-2">
            Meny
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            Velg modul
          </h2>
          <p className="text-base md:text-lg text-foreground/80">
            Her finner du undersider for kart- og statistikkverktøy.
          </p>
        </div>

        <div className="max-w-3xl mx-auto grid grid-cols-1 gap-6">
          {menuItems.map((item) => (
            <Link key={item.title} href={item.href} className="group">
              <article className="rounded-3xl border border-foreground/10 bg-background p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-meadow/70">
                <div className="p-4 rounded-2xl bg-meadow/20 inline-block mb-6">
                  <BarChart3 className="w-9 h-9 text-meadow" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-foreground mb-3">
                  {item.title}
                </h3>
                <p className="text-base text-foreground/80 leading-relaxed mb-8">
                  {item.description}
                </p>
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-terra px-4 py-2 text-sm font-semibold text-background transition-all group-hover:bg-meadow group-hover:text-foreground">
                  Åpne modul
                  <span className="group-hover:translate-x-1.5 transition-transform duration-300">→</span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
