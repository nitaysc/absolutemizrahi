/**
 * Stockfish wrapper using the lila-stockfish-web build served from a CDN.
 * Avoids bundler issues with WASM and Web Worker scripts.
 */

const STOCKFISH_CDN = "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js";

export class StockfishEngine {
  private worker: Worker | null = null;
  private listeners: ((line: string) => void)[] = [];
  private ready = false;

  async init(): Promise<void> {
    if (this.worker) return;
    // Load stockfish.js as a Worker via blob (the file is a self-contained worker script)
    const res = await fetch(STOCKFISH_CDN);
    if (!res.ok) throw new Error("Failed to load Stockfish");
    const code = await res.text();
    const blob = new Blob([code], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === "string" ? e.data : String(e.data);
      this.listeners.forEach((l) => l(line));
    };
    await this.send("uci", (l) => l === "uciok");
    await this.send("isready", (l) => l === "readyok");
    this.ready = true;
  }

  private cmd(line: string) {
    if (!this.worker) throw new Error("Stockfish not initialised");
    this.worker.postMessage(line);
  }

  private send(cmd: string, until: (line: string) => boolean, timeoutMs = 10000): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const collected: string[] = [];
      const handler = (line: string) => {
        collected.push(line);
        if (until(line)) {
          this.listeners = this.listeners.filter((l) => l !== handler);
          clearTimeout(t);
          resolve(collected);
        }
      };
      const t = setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== handler);
        reject(new Error("Stockfish timeout: " + cmd));
      }, timeoutMs);
      this.listeners.push(handler);
      this.cmd(cmd);
    });
  }

  async setElo(elo: number) {
    if (!this.ready) await this.init();
    this.cmd("setoption name UCI_LimitStrength value true");
    this.cmd(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`);
    // Stockfish 10's UCI_Elo lower bound is ~1320, so for any "low Elo" tier
    // we have to manually nerf it via Skill Level + a Contempt bias and rely
    // on very short movetime in moveTimeForElo() below to add blunder-noise.
    // Mapping (rough strength after nerf):
    //   400  -> Skill 0   (random-ish, blunders constantly)
    //   800  -> Skill 2   (very weak club beginner)
    //   1200 -> Skill 5
    //   1600 -> Skill 10
    //   2000 -> Skill 14
    //   2400 -> Skill 18
    //   2800 -> Skill 20
    let skill: number;
    if (elo <= 400)       skill = 0;
    else if (elo <= 800)  skill = 2;
    else if (elo <= 1200) skill = 5;
    else if (elo <= 1600) skill = 10;
    else if (elo <= 2000) skill = 14;
    else if (elo <= 2400) skill = 18;
    else                  skill = 20;
    this.cmd(`setoption name Skill Level value ${skill}`);
  }

  async bestMove(fen: string, moveTimeMs: number): Promise<string> {
    if (!this.ready) await this.init();
    this.cmd("ucinewgame");
    this.cmd(`position fen ${fen}`);
    const lines = await this.send(`go movetime ${Math.max(50, moveTimeMs)}`, (l) =>
      l.startsWith("bestmove"),
      Math.max(5000, moveTimeMs * 4),
    );
    const last = lines[lines.length - 1];
    const parts = last.split(/\s+/);
    return parts[1]; // e.g. "e2e4" or "e7e8q"
  }

  quit() {
    try {
      this.worker?.postMessage("quit");
      this.worker?.terminate();
    } catch {
      // ignore
    }
    this.worker = null;
    this.ready = false;
    this.listeners = [];
  }
}

export const moveTimeForElo = (elo: number): number => {
  // Lower think-time at low Elo = much weaker play (combined with low Skill
  // Level, the engine genuinely blunders instead of finding the best move
  // every time).
  if (elo <= 400)  return 30;
  if (elo <= 800)  return 80;
  if (elo <= 1200) return 250;
  if (elo <= 1600) return 600;
  if (elo <= 2000) return 1200;
  if (elo <= 2400) return 2000;
  return 3000;
};

export const ELO_TIERS = [400, 800, 1200, 1600, 2000, 2400, 2800] as const;

export const eloMultiplier = (elo: number): number => {
  // Low payouts on purpose — chess is skill-based, so the house edge stays small
  // but the upside is capped. Tops out at 1.20× for 2800 Elo.
  if (elo <= 400) return 1.02;
  if (elo <= 800) return 1.04;
  if (elo <= 1200) return 1.06;
  if (elo <= 1600) return 1.09;
  if (elo <= 2000) return 1.12;
  if (elo <= 2400) return 1.16;
  return 1.20;
};