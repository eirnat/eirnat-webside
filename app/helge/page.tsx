import Link from "next/link";
import { loadState, PARTICIPANTS } from "./admin/state";

export const dynamic = "force-dynamic";

const BTN_ACTIVE =
  "active:translate-x-1 active:translate-y-1 active:scale-95 active:shadow-none";

export default async function HelgePage() {
  const state = await loadState();
  const leaderboard = [...PARTICIPANTS]
    .map((name) => ({ name, poeng: state.scores[name] ?? 0 }))
    .sort((a, b) => b.poeng - a.poeng || a.name.localeCompare(b.name, "nb"));
  return (
    <>
      <header className="sticky top-0 z-20 border-b-4 border-black bg-red-950/95 px-4 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold leading-tight text-amber-200">
              Helges utdrikningslag
            </h1>
            <span className="block text-xs font-bold uppercase tracking-wider text-rose-300">
              Poengtavle
            </span>
          </div>
          <Link
            href="/helge/admin"
            className={`rounded-xl border-4 border-black bg-rose-300 px-3 py-2 text-xs font-bold shadow-[3px_3px_0_0_#000] ${BTN_ACTIVE}`}
          >
            Admin
          </Link>
        </div>
      </header>

      <main className="relative z-10 space-y-5 px-4 py-5 pb-10">
        <section className="space-y-2">
          <h2 className="rotate-1 text-xl font-bold text-amber-100">Toppliste</h2>
          {leaderboard.map((player, i) => {
            const isHelge = player.name === "Helge";
            const tilt = i % 2 === 0 ? "rotate-1" : "-rotate-1";
            return (
              <div
                key={player.name}
                className={`flex items-center justify-between rounded-xl border-4 border-black px-4 py-3 shadow-[4px_4px_0_0_#000] ${tilt} ${
                  isHelge
                    ? "bg-gradient-to-r from-amber-200 via-orange-100 to-rose-100"
                    : "bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-black bg-gradient-to-br from-rose-300 to-orange-400 text-sm font-bold">
                    {i + 1}
                  </span>
                  <span
                    className={`font-bold ${isHelge ? "text-amber-800" : ""}`}
                  >
                    {player.name}
                    {isHelge && (
                      <span className="ml-1 text-xs text-amber-900">(brudgom)</span>
                    )}
                  </span>
                </div>
                <span className="text-2xl font-bold text-cyan-700">
                  {player.poeng}
                </span>
              </div>
            );
          })}
        </section>
      </main>
    </>
  );
}
