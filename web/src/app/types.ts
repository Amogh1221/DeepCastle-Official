// ─── Types ───────────────────────────────────────────────────────────────────
type AppPage = "home" | "setup" | "game" | "review" | "lobby";
type PlayerColor = "white" | "black";
type GameMode = "ai" | "p2p";

interface MatchSettings {
  timeLimit: number; // minutes
  increment: number; // seconds
}

interface GameSettings {
  playerColor: PlayerColor;
  thinkTime: number; // seconds for AI
  mode: GameMode;
  matchSettings: MatchSettings;
  matchId?: string;
}

interface Stats {
  score: number;
  depth: number;
  nodes: number;
  nps: number;
  pv: string;
  mateIn: number | null; // null = no mate, positive = bot mates user, negative = user mates bot
}

export type { AppPage, PlayerColor, GameMode, MatchSettings, GameSettings, Stats };