import Link from "next/link";
import { ArrowRight, BarChart3, Dices, Map } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="max-w-3xl mx-auto px-6 py-16 lg:py-24">
        <header className="mb-16">
          <h1 className="text-4xl font-black tracking-tight mb-4">eirnat.no</h1>
          <p className="text-lg text-slate-600 leading-relaxed font-medium">
            En digital drodleplass for nyttig og unyttig.
          </p>
        </header>

        <div className="space-y-6">
          <div className="mb-4 text-xs font-bold tracking-widest text-slate-400 uppercase">
            Mine verktøy og prosjekter
          </div>

          {/* Lag Kart */}
          <Link href="/lag-kart" className="group">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm transition-all hover:shadow-md hover:border-blue-300 hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div className="flex gap-4 items-center">
                  <div className="bg-blue-50 p-3 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Map size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Lag veiarbeidskart</h2>
                    <p className="text-slate-500 text-sm">
                      Tegn stengte veier, omkjøringer og skilt.
                    </p>
                  </div>
                </div>
                <ArrowRight className="text-slate-200 group-hover:text-blue-600 transition-colors" />
              </div>
            </div>
          </Link>

          {/* Trafikktelling */}
          <Link href="/trafikktelling" className="group">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm transition-all hover:shadow-md hover:border-blue-300 hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div className="flex gap-4 items-center">
                  <div className="bg-slate-50 p-3 rounded-xl text-slate-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <BarChart3 size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Trafikktelling</h2>
                    <p className="text-slate-500 text-sm">Analyse og visualisering av trafikkdata.</p>
                  </div>
                </div>
                <ArrowRight className="text-slate-200 group-hover:text-blue-600 transition-colors" />
              </div>
            </div>
          </Link>

          {/* Spillsystemer */}
          <Link href="/spillsystemer" className="group">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm transition-all hover:shadow-md hover:border-blue-300 hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div className="flex gap-4 items-center">
                  <div className="bg-slate-50 p-3 rounded-xl text-slate-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Dices size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Spillsystemer</h2>
                    <p className="text-slate-500 text-sm">
                      Regler, mekanikker og kreative påfunn innen spillverdenen.
                    </p>
                  </div>
                </div>
                <ArrowRight className="text-slate-200 group-hover:text-blue-600 transition-colors" />
              </div>
            </div>
          </Link>
        </div>

        <footer className="mt-24 pt-8 border-t border-slate-200 text-xs text-slate-400">
          <div>© {new Date().getFullYear()} Eirik Natlandsmyr</div>
        </footer>
      </div>
    </div>
  );
}