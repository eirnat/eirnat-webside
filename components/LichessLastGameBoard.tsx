"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess, DEFAULT_POSITION, type Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  AlertCircle,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
} from "lucide-react";

const LICHESS_USERNAME = "eirnat";

type LichessPlayer = {
  user?: { name?: string };
  rating?: number;
};

type LichessGameJson = {
  id: string;
  pgn: string;
  createdAt: number;
  speed?: string;
  winner?: "white" | "black";
  status?: string;
  players: {
    white: LichessPlayer;
    black: LichessPlayer;
  };
};

function parseFirstNdjsonLine(text: string): LichessGameJson | null {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  try {
    return JSON.parse(line) as LichessGameJson;
  } catch {
    return null;
  }
}

function resultLabel(game: LichessGameJson): string {
  if (game.winner === "white") return "Hvit vant";
  if (game.winner === "black") return "Svart vant";
  if (game.status === "draw") return "Remis";
  return "Avsluttet";
}

function speedLabel(speed: string | undefined): string {
  if (!speed) return "Standard";
  const map: Record<string, string> = {
    bullet: "Bullet",
    blitz: "Blitz",
    rapid: "Rapid",
    classical: "Klassisk",
    correspondence: "Korrespondanse",
    ultraBullet: "Ultra bullet",
  };
  return map[speed] ?? speed;
}

function boardOrientationForUser(game: LichessGameJson): "white" | "black" {
  const w = game.players.white.user?.name?.toLowerCase();
  const b = game.players.black.user?.name?.toLowerCase();
  const u = LICHESS_USERNAME.toLowerCase();
  if (w === u) return "white";
  if (b === u) return "black";
  return "white";
}

function fenAtMoveIndex(moves: Move[], index: number): string {
  const replay = new Chess();
  const n = Math.max(0, Math.min(index, moves.length));
  for (let i = 0; i < n; i += 1) {
    replay.move(moves[i]);
  }
  return replay.fen();
}

export function LichessLastGameBoard() {
  const [game, setGame] = useState<LichessGameJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moveIndex, setMoveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://lichess.org/api/games/user/${LICHESS_USERNAME}?max=1&pgnInJson=true`,
          { headers: { Accept: "application/x-ndjson" } }
        );
        if (!res.ok) {
          throw new Error("Kunne ikke hente siste parti fra Lichess.");
        }
        const text = await res.text();
        const parsed = parseFirstNdjsonLine(text);
        if (!cancelled) {
          if (!parsed?.pgn) {
            setGame(null);
            setError(null);
          } else {
            setGame(parsed);
            setError(null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Ukjent feil ved henting av parti."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { moves, parseError } = useMemo(() => {
    if (!game?.pgn) {
      return { moves: [] as Move[], parseError: null as string | null };
    }
    const g = new Chess();
    try {
      g.loadPgn(game.pgn, { newlineChar: "\n" });
      const m = g.history({ verbose: true });
      return { moves: m, parseError: null };
    } catch {
      return {
        moves: [] as Move[],
        parseError: "Kunne ikke lese PGN for dette partiet.",
      };
    }
  }, [game]);

  useEffect(() => {
    setMoveIndex(moves.length);
  }, [moves]);

  const fen = useMemo(() => {
    if (parseError) return DEFAULT_POSITION;
    return fenAtMoveIndex(moves, moveIndex);
  }, [moves, moveIndex, parseError]);

  const maxIndex = moves.length;
  const canStep = maxIndex > 0;

  const orientation = game ? boardOrientationForUser(game) : "white";

  const chessboardOptions = useMemo(
    () => ({
      position: fen,
      boardOrientation: orientation,
      allowDragging: false,
      showNotation: true,
      boardStyle: {
        width: "100%",
        borderRadius: "0.5rem",
      },
      darkSquareStyle: { backgroundColor: "#b58863" },
      lightSquareStyle: { backgroundColor: "#f0d9b5" },
    }),
    [fen, orientation]
  );

  if (loading) {
    return (
      <div
        className="mt-6 border-t border-foreground/10 pt-6"
        role="status"
        aria-live="polite"
      >
        <h4 className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
          Siste parti
        </h4>
        <div className="mt-3 flex items-center gap-2 text-sm text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin text-meadow" />
          Henter siste parti …
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 border-t border-foreground/10 pt-6">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
          Siste parti
        </h4>
        <div
          className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden />
          {error}
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="mt-6 border-t border-foreground/10 pt-6">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
          Siste parti
        </h4>
        <p className="mt-3 text-sm text-foreground/75">
          Ingen registrerte partier funnet for @{LICHESS_USERNAME}.
        </p>
      </div>
    );
  }

  if (parseError) {
    return (
      <div className="mt-6 border-t border-foreground/10 pt-6">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
          Siste parti
        </h4>
        <p className="mt-3 text-sm text-foreground/90">{parseError}</p>
        <a
          href={`https://lichess.org/${game.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-terra underline-offset-2 hover:underline"
        >
          Åpne på Lichess
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    );
  }

  const whiteName = game.players.white.user?.name ?? "Hvit";
  const blackName = game.players.black.user?.name ?? "Svart";
  const when = new Date(game.createdAt).toLocaleString("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="mt-6 border-t border-foreground/10 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
            Siste parti
          </h4>
          <p className="mt-1 text-sm text-foreground/85">
            <span className="font-medium text-foreground">{whiteName}</span>
            <span className="text-foreground/55"> ({game.players.white.rating ?? "—"})</span>
            {" · "}
            <span className="font-medium text-foreground">{blackName}</span>
            <span className="text-foreground/55"> ({game.players.black.rating ?? "—"})</span>
          </p>
          <p className="mt-0.5 text-xs text-foreground/60">
            {when} · {speedLabel(game.speed)} · {resultLabel(game)}
          </p>
        </div>
        <a
          href={`https://lichess.org/${game.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-meadow/50 hover:bg-meadow/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-meadow focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Parti på Lichess
          <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
        </a>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[min(100%,22rem)] overflow-hidden rounded-xl border border-foreground/10 shadow-sm">
        <Chessboard options={chessboardOptions} />
      </div>

      {canStep && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => setMoveIndex(0)}
              disabled={moveIndex === 0}
              className="rounded-lg border border-foreground/15 bg-background p-2 text-foreground transition-colors hover:bg-meadow/15 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Startposisjon"
            >
              <ChevronFirst className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMoveIndex((i) => Math.max(0, i - 1))}
              disabled={moveIndex === 0}
              className="rounded-lg border border-foreground/15 bg-background p-2 text-foreground transition-colors hover:bg-meadow/15 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Forrige trekk"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMoveIndex((i) => Math.min(maxIndex, i + 1))}
              disabled={moveIndex === maxIndex}
              className="rounded-lg border border-foreground/15 bg-background p-2 text-foreground transition-colors hover:bg-meadow/15 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Neste trekk"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMoveIndex(maxIndex)}
              disabled={moveIndex === maxIndex}
              className="rounded-lg border border-foreground/15 bg-background p-2 text-foreground transition-colors hover:bg-meadow/15 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Siste posisjon"
            >
              <ChevronLast className="h-4 w-4" />
            </button>
          </div>
          <label className="flex items-center gap-3 text-xs text-foreground/60">
            <span className="shrink-0 tabular-nums">
              Trekk {moveIndex}/{maxIndex}
            </span>
            <input
              type="range"
              min={0}
              max={maxIndex}
              value={moveIndex}
              onChange={(e) => setMoveIndex(Number(e.target.value))}
              className="h-2 w-full flex-1 cursor-pointer accent-meadow"
              aria-valuemin={0}
              aria-valuemax={maxIndex}
              aria-valuenow={moveIndex}
              aria-label="Velg trekk i partiet"
            />
          </label>
        </div>
      )}
    </div>
  );
}
