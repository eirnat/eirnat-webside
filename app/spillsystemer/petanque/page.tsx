"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Bungee, Fredoka } from "next/font/google";
import Link from "next/link";

type PetanqueTeamKey = "A" | "B";

type PetanqueTeamSetup = {
  players: string[];
};

type PetanqueMatchEvent = {
  team: PetanqueTeamKey;
  points: number;
  at: string;
};

type PetanqueMatchState = {
  matchId: string;
  phase: "setup" | "playing" | "finished";
  includeInStats: boolean;
  targetPoints: number;
  startTime: string | null;
  endTime: string | null;
  teams: Record<PetanqueTeamKey, PetanqueTeamSetup>;
  score: Record<PetanqueTeamKey, number>;
  history: PetanqueMatchEvent[];
  winner: PetanqueTeamKey | null;
};

type LeaderboardRow = {
  name: string;
  wins: number;
  goalDifference: number;
};

const DEFAULT_TARGET_POINTS = 13;
const ACTIVE_PETANQUE_STORAGE_KEY = "active-petanque-match";
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbws6Hpeqp-m_LNInEmJhbN-Wh3sIThYoqb9KqTVPy4zftEDzlomoAm9TlUpX8cW7DLC9A/exec";

const headingFont = Bungee({
  subsets: ["latin"],
  weight: "400",
});

const bodyFont = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const btnPrimary =
  "inline-flex w-full sm:w-auto items-center justify-center rounded-full border-2 border-[#264653] bg-[#E76F51] px-8 py-3.5 text-sm font-semibold text-[#FDF6E3] shadow-[0_5px_0_0_#264653] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#d35f45] hover:shadow-[0_8px_0_0_#264653] active:translate-y-0 active:shadow-[0_3px_0_0_#264653] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2A9D8F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF6E3] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none";

const inputClass =
  "w-full rounded-2xl border-2 border-[#264653] bg-[#fff9ee] px-4 py-3 text-base text-[#264653] shadow-[0_2px_0_0_#264653] transition-colors placeholder:text-[#264653]/50 focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]/40";

const labelClass = "mb-1.5 block text-sm font-semibold text-[#264653]";

const addPlayerBtnClass =
  "mt-3 inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-[#264653] bg-[#2A9D8F] px-5 py-2.5 text-sm font-semibold text-[#FDF6E3] shadow-[0_4px_0_0_#264653] transition-all hover:-translate-y-0.5 hover:bg-[#258b7f] hover:shadow-[0_6px_0_0_#264653]";

function createEmptyTeam(): PetanqueTeamSetup {
  return {
    players: [""],
  };
}

function createInitialPetanqueState(): PetanqueMatchState {
  const initialMatchId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `petanque-${Date.now()}`;
  return {
    matchId: initialMatchId,
    phase: "setup",
    includeInStats: true,
    targetPoints: DEFAULT_TARGET_POINTS,
    startTime: null,
    endTime: null,
    teams: {
      A: createEmptyTeam(),
      B: createEmptyTeam(),
    },
    score: {
      A: 0,
      B: 0,
    },
    history: [],
    winner: null,
  };
}

async function saveToCloud(data: PetanqueMatchState): Promise<boolean> {
  if (!data.winner) return false;

  const winnerTeam: PetanqueTeamKey = data.winner;
  const loserTeam: PetanqueTeamKey = winnerTeam === "A" ? "B" : "A";
  const winners = data.teams[winnerTeam].players
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");
  const losers = data.teams[loserTeam].players
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");

  const payload = {
    schema_version: 1,
    kamp_id: data.matchId,
    dato: new Date(data.endTime ?? Date.now()).toLocaleString("nb-NO"),
    modus: `fri-lagstorrelse-${data.targetPoints}`,
    vinnere: winners,
    tapere: losers,
    score_vinner: data.score[winnerTeam],
    score_taper: data.score[loserTeam],
  };

  try {
    console.log("Sender data til Google Sheets...");
    await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (error) {
    console.error("Klarte ikke å sende kampdata til Google Sheets", error);
    return false;
  }
}

function PetanqueLeaderboard({ scriptUrl }: { scriptUrl: string }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchLeaderboard() {
    setLoading(true);
    setError(null);
    try {
      if (!scriptUrl.trim().endsWith("/exec")) {
        throw new Error("SCRIPT_URL må slutte med /exec for Google Apps Script Web App.");
      }

      const response = await fetch(scriptUrl, {
        method: "GET",
        mode: "cors",
        redirect: "follow",
      });
      if (!response.ok) {
        throw new Error("Nettverksrespons var ikke ok");
      }

      const payload = (await response.json()) as unknown;
      const rowsSource = Array.isArray(payload)
        ? payload
        : payload &&
            typeof payload === "object" &&
            "data" in payload &&
            Array.isArray((payload as { data?: unknown[] }).data)
          ? (payload as { data: unknown[] }).data
          : null;

      if (!rowsSource) {
        throw new Error("Ugyldig leaderboard-format");
      }

      const normalized = rowsSource
        .map((item) => {
          const row = item as {
            name?: unknown;
            wins?: unknown;
            player?: unknown;
            goalDifference?: unknown;
            diff?: unknown;
          };
          return {
            name: String(row.name ?? row.player ?? "").trim(),
            wins: Number(row.wins ?? 0),
            goalDifference: Number(row.goalDifference ?? row.diff ?? 0),
          };
        })
        .filter(
          (item) =>
            item.name.length > 0 &&
            Number.isFinite(item.wins) &&
            item.wins >= 0 &&
            Number.isFinite(item.goalDifference)
        )
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.goalDifference - a.goalDifference;
        });

      setRows(normalized);
    } catch (err) {
      console.error("Klarte ikke hente petanque-toppliste", err);
      const message = err instanceof Error ? err.message : "Ukjent feil";
      setError(`Klarte ikke hente topplisten: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchLeaderboard();
  }, [scriptUrl]);

  return (
    <div className="rounded-3xl border-2 border-[#264653] bg-[linear-gradient(135deg,#fff7ea_0%,#fff3dc_55%,#f9edd4_100%)] p-4 shadow-[0_8px_0_0_#264653] sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h4 className={`text-base text-[#264653] ${headingFont.className}`}>
            Toppliste
          </h4>
          <span
            title="Ved likt antall seire rangeres spillere etter målforskjell."
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#264653]/60 bg-[#E9C46A] text-xs font-bold text-[#264653]"
          >
            i
          </span>
        </div>
        <button
          type="button"
          onClick={() => void fetchLeaderboard()}
          className="inline-flex min-h-[42px] items-center justify-center rounded-full border-2 border-[#264653] bg-[#2A9D8F] px-4 py-2 text-sm font-semibold text-[#FDF6E3] shadow-[0_4px_0_0_#264653] transition-all hover:-translate-y-0.5 hover:bg-[#258b7f] hover:shadow-[0_6px_0_0_#264653]"
        >
          Oppdater
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[#264653]/80" role="status">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#264653]/25 border-t-[#2A9D8F]" />
          Henter toppliste...
        </div>
      )}

      {!loading && error && (
        <p className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-[#264653]/75">Ingen registrerte resultater enda.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-xl bg-[#FDF6E3]/90 px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#264653]/70">
            <span>Spiller</span>
            <span className="text-right">Seire &amp; Skåler</span>
            <span className="text-right">Mål +/-</span>
          </div>
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li
                key={`${row.name}-${index}`}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border-2 border-[#264653]/30 bg-[#fff8ea] px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {index === 0 && <span className="text-base">🥇</span>}
                  {index === 1 && <span className="text-base">🥈</span>}
                  {index === 2 && <span className="text-base">🥉</span>}
                  {index > 2 && (
                    <span className="w-4 shrink-0 text-center text-xs text-foreground/50">
                      {index + 1}
                    </span>
                  )}
                  <span className="truncate text-sm font-semibold text-[#264653]">
                    {row.name}
                  </span>
                </div>
                <span className="text-right text-sm font-bold tabular-nums text-[#264653]">
                  {row.wins}
                </span>
                <span className="text-right text-sm font-bold tabular-nums text-[#264653]">
                  {row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PetanquePage() {
  const [petanqueMatch, setPetanqueMatch] = useState<PetanqueMatchState>(
    createInitialPetanqueState
  );
  const [petanqueStorageReady, setPetanqueStorageReady] = useState(false);
  const [petanqueCloudStatus, setPetanqueCloudStatus] = useState<
    "idle" | "sending" | "saved" | "error" | "skipped"
  >("idle");
  const [lastSyncedMatchId, setLastSyncedMatchId] = useState<string | null>(null);

  const lastPetanqueEvent =
    petanqueMatch.history.length > 0
      ? petanqueMatch.history[petanqueMatch.history.length - 1]
      : null;

  function hentAktiveSpillere(team: PetanqueTeamKey, state: PetanqueMatchState = petanqueMatch) {
    return state.teams[team].players.map((name) => name.trim()).filter(Boolean);
  }

  function formatTeamName(team: PetanqueTeamKey, state: PetanqueMatchState = petanqueMatch) {
    const spillere = hentAktiveSpillere(team, state);
    return spillere.length > 0 ? spillere.join(" / ") : `Lag ${team}`;
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ACTIVE_PETANQUE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PetanqueMatchState;
      if (
        parsed &&
        typeof parsed === "object" &&
        "matchId" in parsed &&
        "phase" in parsed &&
        "teams" in parsed &&
        "score" in parsed &&
        "history" in parsed
      ) {
        const parsedAsMatch = parsed as Partial<PetanqueMatchState> & {
          teams: PetanqueMatchState["teams"];
          score: PetanqueMatchState["score"];
          history: PetanqueMatchState["history"];
        };
        const normalizedTargetPoints = Math.max(
          1,
          Math.round(Number(parsedAsMatch.targetPoints ?? DEFAULT_TARGET_POINTS))
        );
        setPetanqueMatch({
          ...parsedAsMatch,
          includeInStats: parsedAsMatch.includeInStats ?? true,
          targetPoints: Number.isFinite(normalizedTargetPoints)
            ? normalizedTargetPoints
            : DEFAULT_TARGET_POINTS,
        } as PetanqueMatchState);
      }
    } catch (error) {
      console.error("Klarte ikke lese lagret petanque-kamp fra localStorage", error);
      window.localStorage.removeItem(ACTIVE_PETANQUE_STORAGE_KEY);
    } finally {
      setPetanqueStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!petanqueStorageReady) return;
    try {
      window.localStorage.setItem(
        ACTIVE_PETANQUE_STORAGE_KEY,
        JSON.stringify(petanqueMatch)
      );
    } catch (error) {
      console.error("Klarte ikke lagre petanque-kamp i localStorage", error);
    }
  }, [petanqueMatch, petanqueStorageReady]);

  useEffect(() => {
    if (petanqueMatch.phase !== "finished") return;
    if (!petanqueMatch.winner || !petanqueMatch.endTime || !petanqueMatch.matchId) return;
    if (!petanqueMatch.includeInStats) {
      setPetanqueCloudStatus("skipped");
      return;
    }
    if (lastSyncedMatchId === petanqueMatch.matchId) return;

    let cancelled = false;
    const send = async () => {
      setPetanqueCloudStatus("sending");
      const ok = await saveToCloud(petanqueMatch);
      if (cancelled) return;
      setPetanqueCloudStatus(ok ? "saved" : "error");
      if (ok) setLastSyncedMatchId(petanqueMatch.matchId);
    };

    void send();
    return () => {
      cancelled = true;
    };
  }, [petanqueMatch, lastSyncedMatchId]);

  const canStartPetanqueMatch =
    hentAktiveSpillere("A").length > 0 && hentAktiveSpillere("B").length > 0;

  function oppdaterPetanqueSpillernavn(
    team: PetanqueTeamKey,
    playerIdx: number,
    name: string
  ) {
    setPetanqueMatch((prev) => {
      const nextPlayers = [...prev.teams[team].players];
      nextPlayers[playerIdx] = name;
      return {
        ...prev,
        teams: {
          ...prev.teams,
          [team]: {
            ...prev.teams[team],
            players: nextPlayers,
          },
        },
      };
    });
  }

  function leggTilPetanqueSpiller(team: PetanqueTeamKey) {
    setPetanqueMatch((prev) => ({
      ...prev,
      teams: {
        ...prev.teams,
        [team]: {
          ...prev.teams[team],
          players: [...prev.teams[team].players, ""],
        },
      },
    }));
  }

  function fjernPetanqueSpiller(team: PetanqueTeamKey, playerIdx: number) {
    setPetanqueMatch((prev) => {
      if (prev.teams[team].players.length <= 1) return prev;
      const nextPlayers = prev.teams[team].players.filter((_, idx) => idx !== playerIdx);
      return {
        ...prev,
        teams: {
          ...prev.teams,
          [team]: {
            ...prev.teams[team],
            players: nextPlayers.length > 0 ? nextPlayers : [""],
          },
        },
      };
    });
  }

  function handterSpillerInputKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    team: PetanqueTeamKey,
    playerIdx: number
  ) {
    if (event.key !== "Enter") return;

    const erSisteFelt = playerIdx === petanqueMatch.teams[team].players.length - 1;
    if (!erSisteFelt) return;

    const currentValue = petanqueMatch.teams[team].players[playerIdx]?.trim() ?? "";
    if (!currentValue) return;

    event.preventDefault();
    leggTilPetanqueSpiller(team);

    window.setTimeout(() => {
      const nextInput = document.getElementById(
        `petanque-${team}-player-${playerIdx + 1}`
      ) as HTMLInputElement | null;
      nextInput?.focus();
    }, 0);
  }

  function startPetanqueMatch() {
    if (!canStartPetanqueMatch) return;
    const now = new Date().toISOString();
    const matchId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `petanque-${Date.now()}`;
    setPetanqueCloudStatus("idle");
    setPetanqueMatch((prev) => ({
      ...prev,
      matchId,
      phase: "playing",
      startTime: now,
      endTime: null,
      score: { A: 0, B: 0 },
      history: [],
      winner: null,
      teams: {
        A: {
          ...prev.teams.A,
          players: prev.teams.A.players.map((p) => p.trim()).filter(Boolean),
        },
        B: {
          ...prev.teams.B,
          players: prev.teams.B.players.map((p) => p.trim()).filter(Boolean),
        },
      },
    }));
  }

  function oppdaterTargetPoints(value: number) {
    const safeValue = Number.isFinite(value)
      ? Math.max(1, Math.round(value))
      : DEFAULT_TARGET_POINTS;
    setPetanqueMatch((prev) => ({
      ...prev,
      targetPoints: safeValue,
    }));
  }

  function toggleIncludeInStats() {
    setPetanqueMatch((prev) => ({
      ...prev,
      includeInStats: !prev.includeInStats,
    }));
  }

  function addPetanquePoint(team: PetanqueTeamKey) {
    if (petanqueMatch.phase !== "playing") return;
    setPetanqueMatch((prev) => {
      const nextScore = {
        ...prev.score,
        [team]: prev.score[team] + 1,
      };
      const nextHistory = [
        ...prev.history,
        { team, points: 1, at: new Date().toISOString() },
      ];
      const didWin = nextScore[team] >= prev.targetPoints;
      return {
        ...prev,
        score: nextScore,
        history: nextHistory,
        phase: didWin ? "finished" : prev.phase,
        winner: didWin ? team : prev.winner,
        endTime: didWin ? new Date().toISOString() : prev.endTime,
      };
    });
  }

  function undoPetanque() {
    setPetanqueMatch((prev) => {
      if (prev.history.length === 0) return prev;
      const nextHistory = prev.history.slice(0, -1);
      const last = prev.history[prev.history.length - 1];
      const nextScore = {
        ...prev.score,
        [last.team]: Math.max(0, prev.score[last.team] - last.points),
      };
      return {
        ...prev,
        history: nextHistory,
        score: nextScore,
        phase: "playing",
        winner: null,
        endTime: null,
      };
    });
  }

  function resetPetanqueMatch() {
    window.localStorage.removeItem(ACTIVE_PETANQUE_STORAGE_KEY);
    setPetanqueCloudStatus("idle");
    setLastSyncedMatchId(null);
    setPetanqueMatch(createInitialPetanqueState());
  }

  return (
    <main
      className={`relative min-h-screen min-h-[100dvh] overflow-hidden bg-[#FDF6E3] text-[#264653] ${bodyFont.className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #264653 0.8px, transparent 0), radial-gradient(circle at 2px 2px, #2A9D8F 0.6px, transparent 0)",
          backgroundSize: "18px 18px, 27px 27px",
        }}
      />

      <section className="relative z-10 px-6 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] sm:pt-8 md:pb-8 md:pt-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-3 flex items-center justify-center gap-3 text-2xl">
            <span
              role="img"
              aria-label="Skal med olflaske og petanque-kule"
              className="petanque-float"
            >
              🍺🤝⚫
            </span>
          </div>
          <h1 className={`text-4xl leading-tight tracking-tight text-[#264653] sm:text-5xl md:text-6xl ${headingFont.className}`}>
            Petanque
          </h1>
          <p className="mt-4 text-base font-medium md:text-lg text-[#264653]/80 max-w-2xl mx-auto">
            Hvem skal kaste kuler i dag?
          </p>
          <div className="mx-auto mt-6 h-3 w-full max-w-md rotate-[-1deg] rounded-full border-2 border-dashed border-[#264653]/60 bg-[#E9C46A]/30" />
        </div>
      </section>

      <section className="relative z-10 px-6 pb-12 md:pb-16">
        <div className="max-w-4xl mx-auto space-y-6">
          {petanqueMatch.phase === "setup" && (
            <div className="space-y-4 rounded-3xl border-2 border-[#264653] bg-[#fff5df] p-5 shadow-[0_8px_0_0_#264653]">
              <h3 className={`text-xl text-[#264653] ${headingFont.className}`}>
                Hvem skal kaste kuler i dag?
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {(["A", "B"] as const).map((team) => (
                  <div
                    key={team}
                    className={`rounded-3xl border-2 p-4 ${
                      team === "A"
                        ? "border-[#E76F51] bg-[#fff1ea]"
                        : "border-[#2A9D8F] bg-[#eaf9f7]"
                    }`}
                  >
                    <h4 className={`mb-3 text-lg text-[#264653] ${headingFont.className}`}>Lag {team}</h4>

                    <div className="space-y-3">
                      {petanqueMatch.teams[team].players.map((playerName, idx) => (
                        <div key={`${team}-${idx}`}>
                          <label htmlFor={`petanque-${team}-player-${idx}`} className={labelClass}>
                            Spiller {idx + 1}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              id={`petanque-${team}-player-${idx}`}
                              type="text"
                              value={playerName}
                              onChange={(e) =>
                                oppdaterPetanqueSpillernavn(team, idx, e.target.value)
                              }
                              onKeyDown={(e) => handterSpillerInputKeyDown(e, team, idx)}
                              className={`${inputClass} min-h-[52px] text-base font-medium`}
                              placeholder="Navn"
                            />
                            {petanqueMatch.teams[team].players.length > 1 && (
                              <button
                                type="button"
                                onClick={() => fjernPetanqueSpiller(team, idx)}
                                className="inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 border-[#264653] bg-[#E9C46A] text-[#264653] shadow-[0_3px_0_0_#264653] transition-all hover:-translate-y-0.5 hover:bg-[#ddb85f]"
                                aria-label={`Fjern spiller ${idx + 1} fra lag ${team}`}
                              >
                                <X className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => leggTilPetanqueSpiller(team)}
                      className={addPlayerBtnClass}
                    >
                      + Legg til spiller
                    </button>
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border-2 border-[#264653] bg-[#fff9ee] p-3 shadow-[0_5px_0_0_#264653]">
                <h4 className={`mb-2 text-base text-[#264653] ${headingFont.className}`}>
                  Kamp-innstillinger
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={petanqueMatch.includeInStats}
                    onClick={toggleIncludeInStats}
                    className="flex min-h-[44px] grow items-center justify-between rounded-2xl border-2 border-[#264653] bg-[#FDF6E3] px-3 py-2 text-left sm:grow-0 sm:min-w-[240px]"
                  >
                    <p className="text-sm font-bold text-[#264653]">Tell med i statistikk</p>
                    <span
                      className={`relative inline-flex h-7 w-12 items-center rounded-full border-2 border-[#264653] transition-colors ${
                        petanqueMatch.includeInStats ? "bg-[#2A9D8F]" : "bg-[#E9C46A]"
                      }`}
                    >
                      <span
                        className={`inline-block h-[18px] w-[18px] transform rounded-full border-2 border-[#264653] bg-[#FDF6E3] transition-transform ${
                          petanqueMatch.includeInStats ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </span>
                  </button>

                  <div className="flex min-h-[44px] grow items-center gap-2 rounded-2xl border-2 border-[#264653] bg-[#FDF6E3] px-3 py-2">
                    <label className="text-sm font-bold text-[#264653] whitespace-nowrap" htmlFor="petanque-target-points">
                      Spill til
                    </label>
                    <div className="flex flex-nowrap gap-1 overflow-x-auto">
                      {[7, 11, 13].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => oppdaterTargetPoints(preset)}
                          className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold shadow-[0_2px_0_0_#264653] transition-all hover:-translate-y-0.5 ${
                            petanqueMatch.targetPoints === preset
                              ? "border-[#264653] bg-[#E76F51] text-[#FDF6E3]"
                              : "border-[#264653] bg-[#E9C46A] text-[#264653]"
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <input
                      id="petanque-target-points"
                      type="number"
                      min={1}
                      value={petanqueMatch.targetPoints}
                      onChange={(e) =>
                        oppdaterTargetPoints(
                          e.target.value === ""
                            ? DEFAULT_TARGET_POINTS
                            : Number.parseInt(e.target.value, 10)
                        )
                      }
                      className={`${inputClass} min-h-[40px] w-[78px] px-2 py-1 text-center text-sm font-semibold`}
                    />
                    <span className="text-xs font-semibold text-[#264653]/80">poeng</span>
                  </div>
                </div>
                {!petanqueMatch.includeInStats && (
                  <p className="mt-2 text-xs text-[#264653]/70">
                    Denne kampen er bare for moro skyld og lagres ikke.
                  </p>
                )}
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={startPetanqueMatch}
                  disabled={!canStartPetanqueMatch}
                  className={btnPrimary}
                >
                  Start runden
                </button>
              </div>
            </div>
          )}

          {(petanqueMatch.phase === "playing" || petanqueMatch.phase === "finished") && (
            <div className="space-y-5 rounded-3xl border-2 border-[#264653] bg-[#fff5df] p-5 shadow-[0_8px_0_0_#264653]">
              <p className="rounded-full border-2 border-[#264653] bg-[#E9C46A]/70 px-4 py-2 text-center text-sm font-bold text-[#264653]">
                Først til {petanqueMatch.targetPoints}!
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(["A", "B"] as const).map((team) => {
                  const score = petanqueMatch.score[team];
                  const progressPct = Math.min(100, (score / petanqueMatch.targetPoints) * 100);
                  const isTeamA = team === "A";
                  return (
                    <div
                      key={team}
                      className={`rounded-3xl border-2 p-4 ${
                        isTeamA
                          ? "border-[#E76F51] bg-[#fff1ea]"
                          : "border-[#2A9D8F] bg-[#eaf9f7]"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#264653]/70">Lag {team}</p>
                          <p className="truncate text-base font-bold text-[#264653]">
                            {formatTeamName(team)}
                          </p>
                        </div>
                        <div
                          className="petanque-pop"
                        >
                          <div
                          className={`flex h-24 w-24 items-center justify-center rounded-full border-4 text-5xl font-black tabular-nums shadow-[inset_0_-10px_18px_rgba(0,0,0,0.15)] ${
                            isTeamA
                              ? "border-[#264653] bg-[#E76F51] text-[#FDF6E3]"
                              : "border-[#264653] bg-[#2A9D8F] text-[#FDF6E3]"
                          }`}
                          >
                            {score}
                          </div>
                        </div>
                      </div>

                      <div className="h-4 rounded-full border border-[#264653]/30 bg-[#FDF6E3]">
                        <div
                          className="h-4 rounded-full bg-[#E9C46A] transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => addPetanquePoint(team)}
                        disabled={petanqueMatch.phase !== "playing"}
                        className={`mt-4 inline-flex min-h-[56px] w-full items-center justify-center rounded-full border-2 border-[#264653] px-5 py-3 text-lg font-bold text-[#FDF6E3] shadow-[0_5px_0_0_#264653] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_0_0_#264653] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${
                          isTeamA ? "bg-[#E76F51] hover:bg-[#d35f45]" : "bg-[#2A9D8F] hover:bg-[#258b7f]"
                        }`}
                      >
                        +1 poeng
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={undoPetanque}
                  disabled={petanqueMatch.history.length === 0}
                  className="inline-flex min-h-[52px] items-center justify-center rounded-full border-2 border-[#264653] bg-[#fff9ee] px-6 py-3 text-sm font-semibold text-[#264653] shadow-[0_4px_0_0_#264653] transition-all hover:-translate-y-0.5 hover:bg-[#f7eedc] hover:shadow-[0_6px_0_0_#264653] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  Angre siste
                </button>
                <button
                  type="button"
                  onClick={resetPetanqueMatch}
                  className="inline-flex min-h-[52px] items-center justify-center rounded-full border-2 border-[#264653] bg-[#E9C46A] px-6 py-3 text-sm font-semibold text-[#264653] shadow-[0_4px_0_0_#264653] transition-all hover:-translate-y-0.5 hover:bg-[#ddb85f] hover:shadow-[0_6px_0_0_#264653]"
                >
                  Ny kamp
                </button>
              </div>

              {lastPetanqueEvent && (
                <p className="text-sm text-[#264653]/75" role="status">
                  Siste poeng: Lag {lastPetanqueEvent.team} kl.{" "}
                  {new Date(lastPetanqueEvent.at).toLocaleTimeString("nb-NO")}
                </p>
              )}

              {petanqueMatch.phase === "finished" && petanqueMatch.winner && (
                <div className="space-y-2">
                  <div className="rounded-3xl border-2 border-[#264653] bg-[#E9C46A]/40 px-5 py-4">
                    <p className={`text-xl text-[#264653] ${headingFont.className}`}>
                      Skål for vinneren!
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#264653]/85">
                      Vinner: {formatTeamName(petanqueMatch.winner)} (
                      {petanqueMatch.score[petanqueMatch.winner]} poeng)
                    </p>
                    <p className="mt-1 text-xs text-[#264653]/70">
                      Startet:{" "}
                      {petanqueMatch.startTime
                        ? new Date(petanqueMatch.startTime).toLocaleString("nb-NO")
                        : "—"}
                      {" · "}
                      Ferdig:{" "}
                      {petanqueMatch.endTime
                        ? new Date(petanqueMatch.endTime).toLocaleString("nb-NO")
                        : "—"}
                    </p>
                  </div>
                  {petanqueCloudStatus === "sending" && (
                    <p className="text-sm font-medium text-[#264653]/85" role="status">
                      Sender resultater til statistikk...
                    </p>
                  )}
                  {petanqueCloudStatus === "saved" && (
                    <p className="text-sm font-medium text-[#2A9D8F]" role="status">
                      Lagret i resultatbanken ✅
                    </p>
                  )}
                  {petanqueCloudStatus === "skipped" && (
                    <p className="text-sm font-medium text-[#264653]/80" role="status">
                      Denne kampen er bare for moro skyld og ble ikke lagret i statistikken.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <PetanqueLeaderboard scriptUrl={SCRIPT_URL} />
        </div>
      </section>

      <nav
        className="relative z-10 mx-auto max-w-4xl px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 text-center"
        aria-label="Navigasjon"
      >
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-[#264653]/25 bg-[#FDF6E3]/80 px-4 py-2 text-xs font-semibold text-[#264653]/55 transition-colors hover:border-[#264653]/40 hover:text-[#264653]/85"
        >
          Hjem
        </Link>
      </nav>

      <style jsx>{`
        .petanque-float {
          animation: petanqueFloat 3.2s ease-in-out infinite;
        }

        .petanque-pop {
          animation: petanquePop 2.4s ease-in-out infinite;
        }

        @keyframes petanqueFloat {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        @keyframes petanquePop {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.03);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .petanque-float,
          .petanque-pop {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}

