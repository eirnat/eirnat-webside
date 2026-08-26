import { cookies } from "next/headers";

export const PARTICIPANTS = [
  "Alexander",
  "Eirik",
  "Håvard",
  "Johan",
  "Kristoffer",
  "Marius",
  "Morten",
  "Nicklas",
  "Torbjørn",
  "Øyvind",
  "Åsmund",
  "Helge",
] as const;

export const TEAM_COUNT = 4;

export const TEAM_COLORS = [
  "bg-red-400",
  "bg-orange-400",
  "bg-rose-300",
  "bg-amber-300",
] as const;

export type CompetitionMode = "individuell" | "lag" | "alle-mot-helge";

export type AdminState = {
  scores: Record<string, number>;
  mode: CompetitionMode;
  selectedPlayers: string[];
  drawnTeams: string[][];
  exerciseName: string;
  toast: string | null;
};

const COOKIE_NAME = "helge-admin-state";

function emptyScores(): Record<string, number> {
  return Object.fromEntries(PARTICIPANTS.map((name) => [name, 0]));
}

export function defaultState(): AdminState {
  return {
    scores: emptyScores(),
    mode: "individuell",
    selectedPlayers: [],
    drawnTeams: [],
    exerciseName: "",
    toast: null,
  };
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function divideIntoTeams(
  names: readonly string[],
  teamCount: number
): string[][] {
  const shuffled = shuffle([...names]);
  const teams = Array.from({ length: teamCount }, () => [] as string[]);
  shuffled.forEach((name, index) => {
    teams[index % teamCount].push(name);
  });
  return teams;
}

export async function loadState(): Promise<AdminState> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw) as Partial<AdminState>;
    const scores = { ...emptyScores(), ...(parsed.scores ?? {}) };
    return {
      scores,
      mode: parsed.mode ?? "individuell",
      selectedPlayers: parsed.selectedPlayers ?? [],
      drawnTeams: parsed.drawnTeams ?? [],
      exerciseName: parsed.exerciseName ?? "",
      toast: parsed.toast ?? null,
    };
  } catch {
    return defaultState();
  }
}

export async function saveState(state: AdminState): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, JSON.stringify(state), {
    path: "/helge",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
}
