"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Dices,
  CircleDot,
  Crown,
  Target,
} from "lucide-react";
import Link from "next/link";
import { LichessStats } from "@/components/LichessStats";

type SectionId = "petanque" | "crocket" | "sjakk";

const SECTIONS: {
  id: SectionId;
  title: string;
  icon: typeof CircleDot;
  rules: string;
}[] = [
  {
    id: "petanque",
    title: "Petanque",
    icon: Target,
    rules:
      "To eller tre lag kaster stående fra en liten sirkel og prøver å plassere kuler nærmest grisen (cochonnet). Etter at alle kuler er kastet, teller laget som er nærmest poeng — ett poeng per kule som er nærmere enn motstanderens nærmeste. Først til 13 poeng (eller annet avtalt mål) vinner kampen.",
  },
  {
    id: "crocket",
    title: "Crocket",
    icon: CircleDot,
    rules:
      "Målet er å føre ballen gjennom banen og passere alle bøylene i riktig rekkefølge. Du slår ballen med klubben fra der den stanser. Treffer du en motstandersball kan du ta to slag i rad. Første spiller som fullfører banen vinner runden.",
  },
  {
    id: "sjakk",
    title: "Sjakk",
    icon: Crown,
    rules:
      "Hvit og svart bytter på å flytte én brikke om gangen. Målet er å sette motstanderens konge sjakk matt. Partiet kan ende med seier til hvit, seier til svart eller remis.",
  },
];

function AccordionItem({
  id,
  title,
  icon: Icon,
  rules,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  icon: typeof CircleDot;
  rules: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-foreground/10 bg-background shadow-sm overflow-hidden transition-shadow duration-300 hover:shadow-md">
      <button
        type="button"
        id={`accordion-${id}-header`}
        aria-expanded={open}
        aria-controls={`accordion-${id}-panel`}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-meadow/5"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-meadow/20">
            <Icon className="h-5 w-5 text-terra" aria-hidden />
          </span>
          <span className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">
            {title}
          </span>
        </span>
        <ChevronDown
          className={`h-6 w-6 shrink-0 text-meadow transition-transform duration-300 ease-out ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            id={`accordion-${id}-panel`}
            role="region"
            aria-labelledby={`accordion-${id}-header`}
            className="border-t border-foreground/10 px-6 pb-6 pt-2"
          >
            <div className="rounded-2xl border border-foreground/10 bg-meadow/10 px-5 py-4 mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground/70 mb-2">
                Regler (kort)
              </h3>
              <p className="text-base leading-relaxed text-foreground/90">{rules}</p>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const btnPrimary =
  "inline-flex w-full sm:w-auto items-center justify-center rounded-full bg-terra px-8 py-3.5 text-sm font-semibold text-background shadow-sm transition-all duration-300 hover:bg-meadow hover:text-foreground hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-meadow focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none";

const inputClass =
  "w-full rounded-xl border border-foreground/15 bg-background px-4 py-3 text-base text-foreground shadow-sm transition-colors placeholder:text-foreground/40 focus:border-meadow focus:outline-none focus:ring-2 focus:ring-meadow/40";

const labelClass = "block text-sm font-semibold text-foreground mb-1.5";

export default function SpillsystemerPage() {
  const [openSection, setOpenSection] = useState<SectionId | null>("petanque");

  const [crocketSpiller, setCrocketSpiller] = useState("");
  const [crocketBøyler, setCrocketBøyler] = useState("");
  const [crocketFullført, setCrocketFullført] = useState("");
  const [crocketMsg, setCrocketMsg] = useState<string | null>(null);

  const [sjakkHvit, setSjakkHvit] = useState("");
  const [sjakkSvart, setSjakkSvart] = useState("");
  const [sjakkResultat, setSjakkResultat] = useState("");
  const [sjakkMsg, setSjakkMsg] = useState<string | null>(null);

  function toggle(id: SectionId) {
    setOpenSection((cur) => (cur === id ? null : id));
  }

  function lagreCrocket(e: React.FormEvent) {
    e.preventDefault();
    setCrocketMsg("Resultat lagret (kun i nettleseren — koble til lagring senere om ønskelig).");
    setTimeout(() => setCrocketMsg(null), 4000);
  }

  function lagreSjakk(e: React.FormEvent) {
    e.preventDefault();
    setSjakkMsg("Resultat lagret (kun i nettleseren — koble til lagring senere om ønskelig).");
    setTimeout(() => setSjakkMsg(null), 4000);
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="border-b border-foreground/10 bg-background/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-terra px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-meadow hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbake til forsiden
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-sm text-foreground/70">
            <Dices className="h-4 w-4 text-meadow" />
            Spillsystemer
          </div>
        </div>
      </div>

      <section className="px-6 pt-14 pb-6 md:pt-20 md:pb-8">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter leading-tight text-foreground">
            Spillsystemer
          </h1>
          <p className="mt-4 text-base md:text-lg text-foreground/75 max-w-xl mx-auto">
            Åpne en seksjon for korte regler og noteringsskjema.
          </p>
        </div>
      </section>

      <section className="px-6 pb-20 md:pb-28">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {SECTIONS.map(({ id, title, icon, rules }) => (
            <AccordionItem
              key={id}
              id={id}
              title={title}
              icon={icon}
              rules={rules}
              open={openSection === id}
              onToggle={() => toggle(id)}
            >
              {id === "petanque" && (
                <div className="rounded-2xl border border-foreground/10 bg-background p-5">
                  <p className="text-sm text-foreground/80 mb-4">
                    Petanque har nå fått egen underside med kampregistrering, lagring og toppliste.
                  </p>
                  <Link href="/spillsystemer/petanque" className={btnPrimary}>
                    Åpne Petanque-systemet
                  </Link>
                </div>
              )}

              {id === "crocket" && (
                <form onSubmit={lagreCrocket} className="space-y-5 max-w-lg" noValidate>
                  <div>
                    <label htmlFor="crocket-spiller" className={labelClass}>
                      Spiller
                    </label>
                    <input
                      id="crocket-spiller"
                      name="spiller"
                      type="text"
                      autoComplete="name"
                      value={crocketSpiller}
                      onChange={(e) => setCrocketSpiller(e.target.value)}
                      className={inputClass}
                      placeholder="Navn"
                    />
                  </div>
                  <div>
                    <label htmlFor="crocket-boyler" className={labelClass}>
                      Antall bøyler passert
                    </label>
                    <input
                      id="crocket-boyler"
                      name="boyler"
                      type="number"
                      min={0}
                      value={crocketBøyler}
                      onChange={(e) => setCrocketBøyler(e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label htmlFor="crocket-fullfort" className={labelClass}>
                      Fullført
                    </label>
                    <select
                      id="crocket-fullfort"
                      name="fullfort"
                      value={crocketFullført}
                      onChange={(e) => setCrocketFullført(e.target.value)}
                      className={`${inputClass} appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10`}
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232b2d42' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                      }}
                    >
                      <option value="">Velg …</option>
                      <option value="ja">Ja</option>
                      <option value="nei">Nei</option>
                    </select>
                  </div>
                  <div className="pt-2">
                    <button type="submit" className={btnPrimary}>
                      Lagre resultat
                    </button>
                  </div>
                  {crocketMsg && (
                    <p className="text-sm font-medium text-meadow" role="status">
                      {crocketMsg}
                    </p>
                  )}
                </form>
              )}

              {id === "sjakk" && (
                <>
                  <LichessStats />
                  <form onSubmit={lagreSjakk} className="space-y-5 max-w-lg" noValidate>
                    <div>
                      <label htmlFor="sjakk-hvit" className={labelClass}>
                        Hvit spiller
                      </label>
                      <input
                        id="sjakk-hvit"
                        name="hvit"
                        type="text"
                        value={sjakkHvit}
                        onChange={(e) => setSjakkHvit(e.target.value)}
                        className={inputClass}
                        placeholder="Navn"
                      />
                    </div>
                    <div>
                      <label htmlFor="sjakk-svart" className={labelClass}>
                        Svart spiller
                      </label>
                      <input
                        id="sjakk-svart"
                        name="svart"
                        type="text"
                        value={sjakkSvart}
                        onChange={(e) => setSjakkSvart(e.target.value)}
                        className={inputClass}
                        placeholder="Navn"
                      />
                    </div>
                    <div>
                      <label htmlFor="sjakk-resultat" className={labelClass}>
                        Resultat
                      </label>
                      <select
                        id="sjakk-resultat"
                        name="resultat"
                        value={sjakkResultat}
                        onChange={(e) => setSjakkResultat(e.target.value)}
                        className={`${inputClass} appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10`}
                        style={{
                          backgroundImage:
                            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232b2d42' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                        }}
                      >
                        <option value="">Velg resultat …</option>
                        <option value="hvit">Hvit seier</option>
                        <option value="svart">Svart seier</option>
                        <option value="remis">Remis</option>
                      </select>
                    </div>
                    <div className="pt-2">
                      <button type="submit" className={btnPrimary}>
                        Lagre resultat
                      </button>
                    </div>
                    {sjakkMsg && (
                      <p className="text-sm font-medium text-meadow" role="status">
                        {sjakkMsg}
                      </p>
                    )}
                  </form>
                </>
              )}
            </AccordionItem>
          ))}
        </div>
      </section>
    </main>
  );
}
