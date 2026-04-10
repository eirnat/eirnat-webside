"use client";

import { useMemo, useState } from "react";
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
      "To eller tre lag kaster stående fra en liten sirkel og prøver å plassere kuler nærmest grisen (cochonnet). Etter at alle kuler er kastet, teller laget som er nærmest poeng — ett poeng per kule som er nærmere enn motstanderens nærmeste. Først til 13 poeng (eller annet avtalt mål) vinner kampen. Velg antall omganger og noter poeng per lag for hver omgang nedenfor.",
  },
  {
    id: "crocket",
    title: "Crocket",
    icon: CircleDot,
    rules:
      "Målet er å føre ballen gjennom banen og passere alle bøylene i riktig rekkefølge. Du slår ballen med klubben fra der den stanser. Treffer du en motstandersball kan du ta to slag i rad. Første spiller som fullfører banen vinner runden — noter under om runden ble fullført for den aktuelle spilleren.",
  },
  {
    id: "sjakk",
    title: "Sjakk",
    icon: Crown,
    rules:
      "Hvit og svart bytter på å flytte én brikke om gangen. Målet er å sette motstanderens konge sjakk matt. Offiserer (løper, springer, dronning) og bønder har ulike trekk. Partiet kan ende med seier til hvit, seier til svart, eller remis (uavgjort).",
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
          className={`h-6 w-6 shrink-0 text-meadow transition-transform duration-300 ease-out ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
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
              <p className="text-base leading-relaxed text-foreground/90">
                {rules}
              </p>
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

const selectChevronStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232b2d42' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
} as const;

function emptyPetanqueRow(): [string, string, string] {
  return ["", "", ""];
}

export default function SpillsystemerPage() {
  const [openSection, setOpenSection] = useState<SectionId | null>("petanque");

  function toggle(id: SectionId) {
    setOpenSection((cur) => (cur === id ? null : id));
  }

  /* —— Crocket —— */
  const [crocketSpiller, setCrocketSpiller] = useState("");
  const [crocketBøyler, setCrocketBøyler] = useState("");
  const [crocketFullført, setCrocketFullført] = useState("");
  const [crocketMsg, setCrocketMsg] = useState<string | null>(null);

  function lagreCrocket(e: React.FormEvent) {
    e.preventDefault();
    setCrocketMsg("Resultat lagret (kun i nettleseren — koble til lagring senere om ønskelig).");
    setTimeout(() => setCrocketMsg(null), 4000);
  }

  /* —— Sjakk —— */
  const [sjakkHvit, setSjakkHvit] = useState("");
  const [sjakkSvart, setSjakkSvart] = useState("");
  const [sjakkResultat, setSjakkResultat] = useState("");
  const [sjakkMsg, setSjakkMsg] = useState<string | null>(null);

  function lagreSjakk(e: React.FormEvent) {
    e.preventDefault();
    setSjakkMsg("Resultat lagret (kun i nettleseren — koble til lagring senere om ønskelig).");
    setTimeout(() => setSjakkMsg(null), 4000);
  }

  /* —— Petanque —— */
  const PETANQUE_MAX_OMGANGER = 20;
  const [petanqueAntallOmganger, setPetanqueAntallOmganger] = useState(9);
  const [petanqueLag1, setPetanqueLag1] = useState("");
  const [petanqueLag2, setPetanqueLag2] = useState("");
  const [petanqueLag3, setPetanqueLag3] = useState("");
  const [petanqueScores, setPetanqueScores] = useState<[string, string, string][]>(
    () => Array.from({ length: 9 }, () => emptyPetanqueRow())
  );
  const [petanqueMsg, setPetanqueMsg] = useState<string | null>(null);

  function handlePetanqueAntallOmgangerChange(n: number) {
    setPetanqueAntallOmganger(n);
    setPetanqueScores((prev) => {
      if (prev.length === n) return prev;
      if (n > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: n - prev.length }, () => emptyPetanqueRow()),
        ];
      }
      return prev.slice(0, n);
    });
  }

  const petanqueTotals = useMemo(() => {
    const t: [number, number, number] = [0, 0, 0];
    for (const row of petanqueScores) {
      for (let j = 0; j < 3; j += 1) {
        t[j] += Number.parseInt(row[j], 10) || 0;
      }
    }
    return t;
  }, [petanqueScores]);

  function setPetanqueCelle(
    omgangIndex: number,
    lagIndex: 0 | 1 | 2,
    value: string
  ) {
    const digits = value.replace(/\D/g, "");
    setPetanqueScores((prev) => {
      const next = prev.map((row) => [...row] as [string, string, string]);
      if (!next[omgangIndex]) return prev;
      next[omgangIndex][lagIndex] = digits;
      return next;
    });
  }

  function lagrePetanque(e: React.FormEvent) {
    e.preventDefault();
    setPetanqueMsg("Resultat lagret (kun i nettleseren — koble til lagring senere om ønskelig).");
    setTimeout(() => setPetanqueMsg(null), 4000);
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
              {id === "crocket" && (
                <form
                  onSubmit={lagreCrocket}
                  className="space-y-5 max-w-lg"
                  noValidate
                >
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
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232b2d42' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
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
                  <form
                  onSubmit={lagreSjakk}
                  className="space-y-5 max-w-lg"
                  noValidate
                >
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
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232b2d42' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
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

              {id === "petanque" && (
                <form onSubmit={lagrePetanque} className="space-y-6" noValidate>
                  <div className="max-w-xs">
                    <label htmlFor="petanque-omganger" className={labelClass}>
                      Antall omganger
                    </label>
                    <select
                      id="petanque-omganger"
                      name="antall_omganger"
                      value={petanqueAntallOmganger}
                      onChange={(e) =>
                        handlePetanqueAntallOmgangerChange(Number(e.target.value))
                      }
                      className={`${inputClass} appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10`}
                      style={selectChevronStyle}
                    >
                      {Array.from({ length: PETANQUE_MAX_OMGANGER }, (_, i) => i + 1).map(
                        (n) => (
                          <option key={n} value={n}>
                            {n} {n === 1 ? "omgang" : "omganger"}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div className="grid gap-5 max-w-3xl sm:grid-cols-3">
                    <div>
                      <label htmlFor="petanque-lag1" className={labelClass}>
                        Lag 1
                      </label>
                      <input
                        id="petanque-lag1"
                        name="lag1"
                        type="text"
                        value={petanqueLag1}
                        onChange={(e) => setPetanqueLag1(e.target.value)}
                        className={inputClass}
                        placeholder="Navn"
                      />
                    </div>
                    <div>
                      <label htmlFor="petanque-lag2" className={labelClass}>
                        Lag 2
                      </label>
                      <input
                        id="petanque-lag2"
                        name="lag2"
                        type="text"
                        value={petanqueLag2}
                        onChange={(e) => setPetanqueLag2(e.target.value)}
                        className={inputClass}
                        placeholder="Navn"
                      />
                    </div>
                    <div>
                      <label htmlFor="petanque-lag3" className={labelClass}>
                        Lag 3
                      </label>
                      <input
                        id="petanque-lag3"
                        name="lag3"
                        type="text"
                        value={petanqueLag3}
                        onChange={(e) => setPetanqueLag3(e.target.value)}
                        className={inputClass}
                        placeholder="Navn"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-foreground/15 shadow-sm">
                    <table className="w-full min-w-[340px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-foreground/15 bg-meadow/15">
                          <th
                            scope="col"
                            className="px-3 py-3 font-semibold text-foreground w-[4.5rem]"
                          >
                            Omgang
                          </th>
                          <th
                            scope="col"
                            className="px-2 py-3 font-semibold text-foreground min-w-[5.5rem]"
                          >
                            Poeng L1
                          </th>
                          <th
                            scope="col"
                            className="px-2 py-3 font-semibold text-foreground min-w-[5.5rem]"
                          >
                            Poeng L2
                          </th>
                          <th
                            scope="col"
                            className="px-2 py-3 font-semibold text-foreground min-w-[5.5rem]"
                          >
                            Poeng L3
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {petanqueScores.map((row, i) => (
                          <tr
                            key={i}
                            className="border-b border-foreground/10 last:border-0 odd:bg-background even:bg-foreground/[0.03]"
                          >
                            <th
                              scope="row"
                              className="px-3 py-3 font-medium text-foreground/90 whitespace-nowrap"
                            >
                              {i + 1}
                            </th>
                            {([0, 1, 2] as const).map((lagIdx) => (
                              <td key={lagIdx} className="px-2 py-2">
                                <label
                                  htmlFor={`petanque-l${lagIdx + 1}-${i + 1}`}
                                  className="sr-only"
                                >
                                  Poeng lag {lagIdx + 1}, omgang {i + 1}
                                </label>
                                <input
                                  id={`petanque-l${lagIdx + 1}-${i + 1}`}
                                  name={`end_l${lagIdx + 1}_${i + 1}`}
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={row[lagIdx]}
                                  onChange={(e) =>
                                    setPetanqueCelle(i, lagIdx, e.target.value)
                                  }
                                  className={`${inputClass} py-2.5 text-center tabular-nums`}
                                  placeholder="—"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-4 max-w-3xl sm:grid-cols-3">
                    {([1, 2, 3] as const).map((n) => (
                      <div key={n}>
                        <label
                          htmlFor={`petanque-total-l${n}`}
                          className={labelClass}
                        >
                          Total lag {n}
                        </label>
                        <input
                          id={`petanque-total-l${n}`}
                          name={`total_l${n}`}
                          type="text"
                          readOnly
                          value={String(petanqueTotals[n - 1])}
                          className={`${inputClass} bg-meadow/10 font-semibold tabular-nums border-meadow/30`}
                          aria-live="polite"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-foreground/60 -mt-2 max-w-3xl">
                    Totalene summerer poeng fra alle valgte omganger. Reduserer du
                    antall omganger, slettes rader nederst (lagre først om du vil
                    beholde tallene).
                  </p>

                  <div className="pt-1">
                    <button type="submit" className={btnPrimary}>
                      Lagre resultat
                    </button>
                  </div>
                  {petanqueMsg && (
                    <p className="text-sm font-medium text-meadow" role="status">
                      {petanqueMsg}
                    </p>
                  )}
                </form>
              )}
            </AccordionItem>
          ))}
        </div>
      </section>
    </main>
  );
}
