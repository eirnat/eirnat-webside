// File: app/page.tsx
import { BrainCircuit, Dices, BarChart3, FlaskConical } from 'lucide-react';
import Link from 'next/link';

// Dette er dataene for flisene dine. Det gjør det lett å endre dem senere.
const tiles = [
  {
    title: "Spillsystemer",
    description: "Regler, mekanikker og kreative påfunn innen spillverdenen.",
    icon: Dices, // En passende logo (terninger)
    href: "/spillsystemer",
    color: "text-terra"
  },
  {
    title: "Kart og statistikk",
    description: "Visualisering av data og interessante geografiske oversikter.",
    icon: BarChart3, // En passende logo (stolpediagram)
    href: "/kartogstatistikk",
    color: "text-meadow"
  },
  {
    title: "Ymse prøving og feiling",
    description: "Småprosjekter, eksperimenter og ting som kanskje virker.",
    icon: FlaskConical, // En passende logo (kolbe)
    href: "/ymse",
    color: "text-terra"
  },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Header-seksjon med "logo" */}
      <div className="bg-background/80 border-b border-foreground/10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Dette er hovedlogoen din */}
            <BrainCircuit className="w-9 h-9 text-terra" />
            <span className="text-2xl font-bold tracking-tighter text-foreground">eirnat.no</span>
          </div>
          {/* Valgfri: En liten kontaktknapp eller lignende */}
          <div className="text-sm text-foreground/70">Eirnat // 2026</div>
        </div>
      </div>

      {/* Hero-seksjon (Tittelen) */}
      <div>
        <div className="max-w-4xl mx-auto px-6 pt-12 pb-8 md:pt-12 md:pb-8 lg:pt-16 lg:pb-12 text-center">
          {/* Her bruker vi tracking-tighter for en moderne, tett look på tittelen */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-tight text-foreground">
            Digital <span className="text-terra">drodleplass</span>
          </h1>
        </div>
      </div>

      {/* Flis-seksjonen (Meny) */}
      <div className="max-w-7xl mx-auto px-6 pt-1 pb-10 md:pt-2 md:pb-10 lg:pt-4 lg:pb-14">
        {/* Dette er rutenettet som gjør det responsivt:
            grid-cols-1 = standard 1 kolonne (mobil)
            md:grid-cols-3 = 3 kolonner på "medium" skjerm (laptop) og oppover */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {tiles.map((tile) => (
            // Vi pakker hver flis inn i en Link-komponent så hele boksen er klikkbar
            <Link key={tile.title} href={tile.href} className="group">
              {/* Selve flisen. 'transition-all duration-300' gjør at den flyter pent når du holder musa over */}
              <div className="bg-background p-8 md:p-7 lg:p-10 h-full rounded-[2rem] border border-foreground/10 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 hover:border-meadow/70">
                <div>
                  {/* Bakgrunnen til ikonet */}
                  <div className="p-4 rounded-2xl bg-meadow/20 inline-block mb-6 md:mb-5 lg:mb-8">
                    <tile.icon className={`w-9 h-9 ${tile.color}`} />
                  </div>
                  {/* Tittelen på flisen */}
                  <h2 className="text-2xl md:text-[1.65rem] lg:text-3xl font-bold tracking-tight text-foreground mb-3 md:mb-2 lg:mb-4">
                    {tile.title}
                  </h2>
                  {/* Beskrivelsen */}
                  <p className="text-sm md:text-[0.95rem] lg:text-base text-foreground/80 leading-relaxed mb-7 md:mb-6 lg:mb-10">
                    {tile.description}
                  </p>
                </div>
                
                {/* En liten pil nederst som vises når du hoverer over boksen */}
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-terra px-4 py-2 text-sm font-semibold text-background transition-all group-hover:bg-meadow group-hover:text-foreground">
                  Utforsk mer
                  <span className="group-hover:translate-x-1.5 transition-transform duration-300">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}