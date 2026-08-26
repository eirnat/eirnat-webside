import { loadState, PARTICIPANTS, TEAM_COLORS } from "./state";

export const dynamic = "force-dynamic";

const MODES = [
  { id: "individuell", label: "Individuell" },
  { id: "lag", label: "Lag" },
  { id: "alle-mot-helge", label: "Alle mot Helge" },
] as const;

const PODIUM_BTNS = [
  { delta: 3, label: "1. plass", points: "+3", bg: "bg-amber-300" },
  { delta: 2, label: "2. plass", points: "+2", bg: "bg-orange-200" },
  { delta: 1, label: "3. plass", points: "+1", bg: "bg-rose-200" },
] as const;

const CHIP_COLORS = ["bg-rose-200", "bg-orange-200", "bg-red-200"] as const;

function playerChipClass(name: string, isSelected: boolean, index: number): string {
  const base =
    "block min-h-[4rem] w-full rounded-2xl border-4 border-black px-3 py-3 text-center text-sm font-bold shadow-[4px_4px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:scale-95 active:shadow-[2px_2px_0_0_#000]";
  const isHelge = name === "Helge";

  if (isSelected) {
    return `${base} border-[6px] scale-[1.02] ${
      isHelge ? "bg-amber-400" : "bg-rose-400"
    }`;
  }
  if (isHelge) {
    return `${base} bg-gradient-to-br from-amber-300 via-yellow-300 to-orange-200 text-black`;
  }
  return `${base} ${CHIP_COLORS[index % CHIP_COLORS.length]} text-black`;
}

function href(params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return `/helge/admin/action?${q.toString()}`;
}

type PageProps = {
  searchParams: Promise<{ reset?: string }>;
};

export default async function HelgeAdminPage({ searchParams }: PageProps) {
  const { reset } = await searchParams;
  const showResetConfirm = reset === "confirm";
  const state = await loadState();

  return (
    <>
      {state.toast ? (
        <div
          role="status"
          className="fixed left-4 right-4 top-20 z-50 mx-auto max-w-lg rounded-2xl border-4 border-black bg-lime-300 px-4 py-3 text-center text-base font-bold text-black shadow-[5px_5px_0_0_#000]"
        >
          <span className="block">{state.toast}</span>
        </div>
      ) : null}

      <header className="border-b-4 border-black bg-red-950 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold leading-tight text-amber-200">
              Helges utdrikningslag
            </h1>
            <span className="block text-xs font-bold uppercase tracking-wider text-orange-300">
              Kontrollpanel · modus: {state.mode}
            </span>
          </div>
          <a
            href="/helge"
            className="rounded-xl border-4 border-black bg-amber-200 px-3 py-2 text-xs font-bold shadow-[3px_3px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <span className="block">Til tavle</span>
          </a>
        </div>
      </header>

      <main className="space-y-5 px-4 py-5 pb-8">
        <section
          id="konkurranse"
          className="scroll-mt-6 rounded-2xl border-4 border-black bg-orange-100 p-4 shadow-[6px_6px_0_#000]"
        >
          <h2 className="text-xl font-bold text-red-900">Konkurranse</h2>
          <span className="mt-1 block text-sm font-semibold text-black/60">
            Trykk for å velge spillere eller lag.
          </span>

          <form
            method="GET"
            action="/helge/admin/action"
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <input type="hidden" name="action" value="exercise" />
            <label className="flex-1">
              <span className="text-base font-bold text-black">Øvelse</span>
              <input
                type="text"
                name="exerciseName"
                defaultValue={state.exerciseName}
                placeholder="F.eks. Ølstafett"
                className="mt-2 w-full rounded-xl border-4 border-black bg-white px-4 py-3 text-base font-semibold text-black placeholder:text-black/40 shadow-[4px_4px_0_0_#000] outline-none focus:ring-4 focus:ring-orange-400"
              />
            </label>
            <button
              type="submit"
              className="mt-6 min-h-[3rem] self-end rounded-xl border-4 border-black bg-white px-4 text-sm font-bold shadow-[3px_3px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <span className="block">Lagre</span>
            </button>
          </form>

          <span className="mt-4 block text-sm font-bold text-black/60">Modus</span>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {MODES.map((m) => (
              <a
                key={m.id}
                href={href({ action: "mode", mode: m.id })}
                className={`block min-h-[3.5rem] rounded-xl border-4 border-black px-3 py-3 text-center text-sm font-bold shadow-[3px_3px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                  state.mode === m.id ? "bg-rose-400" : "bg-white"
                }`}
              >
                <span className="block">{m.label}</span>
              </a>
            ))}
          </div>

          {state.mode === "individuell" ? (
            <div id="spillere" className="mt-4 scroll-mt-6 grid grid-cols-2 gap-3">
              {PARTICIPANTS.map((name, index) => {
                const isSelected = state.selectedPlayers.includes(name);
                return (
                  <a
                    key={name}
                    href={href({ action: "toggle", name })}
                    className={playerChipClass(name, isSelected, index)}
                  >
                    {isSelected ? (
                      <span className="mr-1 inline-block text-sm">★</span>
                    ) : null}
                    <span className="block">{name}</span>
                    <span className="block text-xs font-semibold opacity-70">
                      {state.scores[name]} p
                    </span>
                  </a>
                );
              })}
            </div>
          ) : null}

          {state.mode === "alle-mot-helge" ? (
            <div id="spillere" className="mt-4 scroll-mt-6 grid grid-cols-1 gap-3">
              <a
                href={href({ action: "helge" })}
                className={`block min-h-[5rem] rounded-2xl border-4 border-black bg-gradient-to-br from-amber-300 via-yellow-300 to-orange-200 px-4 py-4 text-center text-2xl font-bold shadow-[5px_5px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                  state.selectedPlayers.length === 1 &&
                  state.selectedPlayers[0] === "Helge"
                    ? "border-[6px] ring-4 ring-amber-500"
                    : ""
                }`}
              >
                <span className="block">Helge</span>
                <span className="mt-1 block text-sm font-semibold opacity-70">
                  {state.scores.Helge} poeng
                </span>
              </a>
              <a
                href={href({ action: "resten" })}
                className={`block min-h-[5rem] rounded-2xl border-4 border-black bg-red-300 px-4 py-4 text-center text-xl font-bold shadow-[5px_5px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                  state.selectedPlayers.length === 11 &&
                  !state.selectedPlayers.includes("Helge")
                    ? "border-[6px] ring-4 ring-rose-600"
                    : ""
                }`}
              >
                <span className="block">Resten av gjengen</span>
                <span className="mt-1 block text-sm font-semibold opacity-70">
                  11 spillere
                </span>
              </a>
            </div>
          ) : null}

          {state.mode === "lag" ? (
            <div id="lag" className="mt-4 scroll-mt-6 space-y-3">
              <span className="block text-sm font-bold text-black/60">
                4 lag — 3 spillere per lag (tilfeldig)
              </span>

              <a
                href={href({ action: "redraw" })}
                className="block min-h-[3.5rem] rounded-xl border-4 border-black bg-orange-400 px-4 py-3 text-center text-base font-bold shadow-[4px_4px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <span className="block">Bland lag på nytt</span>
              </a>

              {state.drawnTeams.map((members, index) => {
                const isActive =
                  state.selectedPlayers.length === members.length &&
                  members.every((m) => state.selectedPlayers.includes(m));
                return (
                  <a
                    key={`lag-${index}-${members.join("-")}`}
                    href={href({ action: "team", index: String(index) })}
                    className={`relative block rounded-2xl border-4 border-black p-4 text-left shadow-[4px_4px_0_0_#000] transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                      TEAM_COLORS[index % TEAM_COLORS.length]
                    } ${
                      isActive
                        ? "scale-[1.03] border-[8px] border-black shadow-[8px_8px_0_0_#000] ring-4 ring-amber-400"
                        : "opacity-90"
                    }`}
                  >
                    {isActive ? (
                      <span className="absolute -right-2 -top-2 rounded-full border-4 border-black bg-amber-300 px-3 py-1 text-xs font-bold shadow-[3px_3px_0_0_#000]">
                        ★ Valgt
                      </span>
                    ) : null}
                    <span className="block text-lg font-bold">
                      Lag {index + 1}
                    </span>
                    <span className="mt-1 block text-sm font-semibold">
                      {members.join(", ")}
                    </span>
                  </a>
                );
              })}
            </div>
          ) : null}

          {state.mode !== "lag" ? (
            <div className="mt-4 rounded-xl border-4 border-black bg-white px-3 py-3 text-center text-sm font-semibold">
              {state.selectedPlayers.length > 0 ? (
                <>
                  <span className="font-bold text-rose-700">
                    {state.selectedPlayers.length}
                  </span>{" "}
                  markert: {state.selectedPlayers.join(", ")}
                </>
              ) : (
                <span className="text-black/50">Ingen markert ennå</span>
              )}
            </div>
          ) : null}
        </section>

        <section
          id="poeng"
          className="scroll-mt-6 rounded-2xl border-4 border-black bg-red-950 p-4 shadow-[6px_6px_0_#000]"
        >
          <h2 className="text-lg font-bold text-amber-200">Gi poeng</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {PODIUM_BTNS.map((btn) => (
              <a
                key={btn.delta}
                href={href({ action: "points", delta: String(btn.delta) })}
                className={`block min-h-[3.75rem] rounded-xl border-4 border-black ${btn.bg} px-1 py-2 text-center font-bold text-black shadow-[4px_4px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                  state.selectedPlayers.length === 0 ? "opacity-60" : ""
                }`}
              >
                <span className="block text-xs leading-tight">{btn.label}</span>
                <span className="block text-xl">{btn.points}</span>
              </a>
            ))}
          </div>

          <a
            href={href({ action: "points", delta: "-1" })}
            className={`mt-2 block min-h-[2.5rem] rounded-xl border-4 border-black bg-rose-400 px-4 py-2 text-center text-base font-bold text-black shadow-[3px_3px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
              state.selectedPlayers.length === 0 ? "opacity-60" : ""
            }`}
          >
            <span className="block">−1 angrer</span>
          </a>
        </section>

        <section
          id="nullstill"
          className="scroll-mt-6 rounded-2xl border-4 border-black bg-white p-4 shadow-[6px_6px_0_#000]"
        >
          <h2 className="text-lg font-bold text-red-900">Nullstill</h2>
          <span className="mt-1 block text-sm font-semibold text-black/60">
            Sletter alle poeng og tilbakestiller konkurransen.
          </span>

          {showResetConfirm ? (
            <div className="mt-4 space-y-3 rounded-2xl border-4 border-black bg-rose-100 p-4 shadow-[4px_4px_0_0_#000]">
              <span className="block text-base font-bold text-red-900">
                Er du helt sikker?
              </span>
              <span className="block text-sm font-semibold text-black/80">
                Dette nullstiller alle poeng på tavlen og i kontrollpanelet. Det
                kan ikke angres.
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <a
                  href={href({ action: "reset", confirm: "yes" })}
                  className="block min-h-[3.5rem] rounded-xl border-4 border-black bg-red-600 px-4 py-3 text-center text-sm font-bold text-white shadow-[4px_4px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  <span className="block">Ja, nullstill alt</span>
                </a>
                <a
                  href="/helge/admin"
                  className="block min-h-[3.5rem] rounded-xl border-4 border-black bg-white px-4 py-3 text-center text-sm font-bold text-black shadow-[4px_4px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  <span className="block">Avbryt</span>
                </a>
              </div>
            </div>
          ) : (
            <a
              href="/helge/admin?reset=confirm#nullstill"
              className="mt-4 block min-h-[3.5rem] rounded-xl border-4 border-black bg-rose-200 px-4 py-3 text-center text-sm font-bold text-red-900 shadow-[4px_4px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <span className="block">Nullstill alle poeng</span>
            </a>
          )}
        </section>
      </main>
    </>
  );
}
