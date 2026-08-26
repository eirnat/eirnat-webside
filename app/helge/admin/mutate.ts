import {
  defaultState,
  divideIntoTeams,
  loadState,
  PARTICIPANTS,
  saveState,
  TEAM_COUNT,
  type CompetitionMode,
} from "./state";

const REST_OF_GANG = PARTICIPANTS.filter((name) => name !== "Helge");

function pick(
  sp: URLSearchParams,
  key: string
): string | undefined {
  return sp.get(key) ?? undefined;
}

export async function applyAdminMutation(sp: URLSearchParams) {
  const action = pick(sp, "action");
  if (!action) return;

  const state = await loadState();
  state.toast = null;

  if (action === "mode") {
    const mode = pick(sp, "mode") as CompetitionMode | undefined;
    if (mode === "individuell" || mode === "lag" || mode === "alle-mot-helge") {
      state.mode = mode;
      state.selectedPlayers = [];
      state.drawnTeams =
        mode === "lag" ? divideIntoTeams(PARTICIPANTS, TEAM_COUNT) : [];
    }
  }

  if (action === "toggle") {
    const name = pick(sp, "name");
    if (name && PARTICIPANTS.includes(name as (typeof PARTICIPANTS)[number])) {
      state.selectedPlayers = state.selectedPlayers.includes(name)
        ? state.selectedPlayers.filter((n) => n !== name)
        : [...state.selectedPlayers, name];
    }
  }

  if (action === "helge") {
    state.selectedPlayers = ["Helge"];
  }

  if (action === "resten") {
    state.selectedPlayers = [...REST_OF_GANG];
  }

  if (action === "team") {
    const index = Number(pick(sp, "index"));
    const team = state.drawnTeams[index];
    if (team) state.selectedPlayers = [...team];
  }

  if (action === "redraw") {
    state.drawnTeams = divideIntoTeams(PARTICIPANTS, TEAM_COUNT);
    state.selectedPlayers = [];
  }

  if (action === "points") {
    const delta = Number(pick(sp, "delta"));
    if (!state.selectedPlayers.length) {
      state.toast = "Velg spillere først!";
    } else if (!Number.isNaN(delta)) {
      const count = state.selectedPlayers.length;
      const sign = delta > 0 ? "+" : "";
      const exercise = state.exerciseName.trim();
      for (const name of state.selectedPlayers) {
        state.scores[name] = (state.scores[name] ?? 0) + delta;
      }
      state.selectedPlayers = [];
      state.toast = exercise
        ? `Ga ${sign}${delta} poeng til ${count} spillere i «${exercise}»!`
        : `Ga ${sign}${delta} poeng til ${count} spillere!`;
    }
  }

  if (action === "exercise") {
    const exerciseName = pick(sp, "exerciseName");
    if (exerciseName !== undefined) {
      state.exerciseName = exerciseName;
      state.toast = "Øvelse lagret!";
    }
  }

  if (action === "reset" && pick(sp, "confirm") === "yes") {
    const fresh = defaultState();
    fresh.toast = "Alle poeng er nullstilt!";
    await saveState(fresh);
    return;
  }

  await saveState(state);
}
