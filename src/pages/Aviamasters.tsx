import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment, Cloud, Clouds, Text } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BetControls } from "@/components/BetControls";
import { formatCoins } from "@/lib/format";
import { Plane as PlaneIcon } from "lucide-react";

type Pace = "slow" | "normal" | "fast";

// Tuned to ~0.97 RTP feel. Coin gains > rocket loss in expectation but rockets
// can spiral the multiplier to bust quickly, matching original Aviamasters.
const PACE_CFG: Record<
  Pace,
  { tickMs: number; coinChance: number; rocketChance: number; coinGain: [number, number] }
> = {
  slow:   { tickMs: 1000, coinChance: 0.34, rocketChance: 0.10, coinGain: [0.15, 0.40] },
  normal: { tickMs: 700,  coinChance: 0.38, rocketChance: 0.16, coinGain: [0.20, 0.55] },
  fast:   { tickMs: 450,  coinChance: 0.42, rocketChance: 0.24, coinGain: [0.25, 0.80] },
};

type SceneItem = {
  id: number;
  kind: "coin" | "rocket";
  // World start position (right side, off-screen) — moves leftward.
  z: number;        // along travel axis (positive = far ahead, decreases over time)
  x: number;        // lateral offset
  y: number;        // height
  value: number;    // coin gain or post-rocket multiplier
  collected?: boolean;
};

// ---------- 3D pieces ----------

function Plane({ flying, busted }: { flying: boolean; busted: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current) return;
    t.current += dt;
    if (busted) {
      // Nose-dive into the sea.
      ref.current.rotation.x = Math.min(ref.current.rotation.x + dt * 1.5, Math.PI / 2);
      ref.current.position.y = Math.max(ref.current.position.y - dt * 4, -2);
    } else if (flying) {
      ref.current.position.y = 0.6 + Math.sin(t.current * 1.6) * 0.25;
      ref.current.rotation.z = Math.sin(t.current * 1.2) * 0.18;
      ref.current.rotation.x = Math.sin(t.current * 1.6) * 0.06;
    } else {
      ref.current.position.y = 0.6;
      ref.current.rotation.set(0, 0, 0);
    }
  });
  return (
    <group ref={ref} position={[0, 0.6, 0]}>
      {/* Fuselage */}
      <mesh castShadow>
        <capsuleGeometry args={[0.32, 1.2, 8, 16]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.4} roughness={0.35} />
      </mesh>
      {/* Red stripe */}
      <mesh position={[0, 0, 0]}>
        <torusGeometry args={[0.33, 0.04, 8, 32]} />
        <meshStandardMaterial color="#ef4444" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Cockpit */}
      <mesh position={[0, 0.18, 0.05]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#38bdf8" metalness={0.7} roughness={0.1} transparent opacity={0.85} />
      </mesh>
      {/* Wings */}
      <mesh rotation={[0, 0, 0]}>
        <boxGeometry args={[2.2, 0.08, 0.45]} />
        <meshStandardMaterial color="#f1f5f9" metalness={0.4} roughness={0.4} />
      </mesh>
      {/* Tail */}
      <mesh position={[0, 0.25, -0.7]}>
        <boxGeometry args={[0.08, 0.4, 0.3]} />
        <meshStandardMaterial color="#ef4444" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, -0.7]}>
        <boxGeometry args={[0.8, 0.06, 0.2]} />
        <meshStandardMaterial color="#f1f5f9" metalness={0.4} roughness={0.4} />
      </mesh>
      {/* Propeller hub */}
      <mesh position={[0, 0, 0.7]}>
        <coneGeometry args={[0.18, 0.3, 16]} />
        <meshStandardMaterial color="#ef4444" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* Spinning prop */}
      <Propeller flying={flying && !busted} />
    </group>
  );
}

function Propeller({ flying }: { flying: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current && flying) ref.current.rotation.z += dt * 40;
  });
  return (
    <mesh ref={ref} position={[0, 0, 0.85]}>
      <boxGeometry args={[0.9, 0.04, 0.04]} />
      <meshStandardMaterial color="#1e293b" transparent opacity={0.6} />
    </mesh>
  );
}

function Coin({ value, position, onCollect }: { value: number; position: [number, number, number]; onCollect: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const collected = useRef(false);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 3;
    ref.current.position.z += dt * 6; // travel toward camera (plane is at z=0)
    // Collect when crossing the plane.
    if (!collected.current && ref.current.position.z > -0.4 && ref.current.position.z < 0.6 && Math.abs(ref.current.position.x) < 1.2) {
      collected.current = true;
      onCollect();
    }
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <cylinderGeometry args={[0.4, 0.4, 0.08, 32]} />
        <meshStandardMaterial color="#facc15" metalness={0.9} roughness={0.15} emissive="#fbbf24" emissiveIntensity={0.35} />
      </mesh>
      <Text position={[0, 0, 0.05]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.22} color="#78350f" anchorX="center" anchorY="middle">
        {`+${value.toFixed(2)}`}
      </Text>
    </group>
  );
}

function Rocket({ position, onHit }: { position: [number, number, number]; onHit: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const hit = useRef(false);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.z += dt * 8;
    ref.current.rotation.z += dt * 2;
    if (!hit.current && ref.current.position.z > -0.4 && ref.current.position.z < 0.6 && Math.abs(ref.current.position.x) < 1.2) {
      hit.current = true;
      onHit();
    }
  });
  return (
    <group ref={ref} position={position} rotation={[0, 0, Math.PI / 2]}>
      <mesh>
        <cylinderGeometry args={[0.12, 0.12, 0.7, 16]} />
        <meshStandardMaterial color="#dc2626" metalness={0.6} roughness={0.3} emissive="#7f1d1d" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <coneGeometry args={[0.12, 0.25, 16]} />
        <meshStandardMaterial color="#fafafa" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Flame */}
      <mesh position={[0, -0.45, 0]}>
        <coneGeometry args={[0.14, 0.5, 12]} />
        <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={1.2} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function Sea() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshStandardMaterial;
    // Subtle hue shift to suggest waves moving.
    m.emissiveIntensity = 0.05 + Math.sin(clock.elapsedTime) * 0.02;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow>
      <planeGeometry args={[80, 200, 1, 1]} />
      <meshStandardMaterial color="#0c4a6e" metalness={0.6} roughness={0.4} emissive="#0369a1" emissiveIntensity={0.06} />
    </mesh>
  );
}

function Carrier({ z }: { z: number }) {
  // A chunky aircraft carrier prop scrolling past in the background ocean.
  return (
    <group position={[3.5, -1.8, z]}>
      <mesh>
        <boxGeometry args={[2, 0.4, 6]} />
        <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0.6, 0.5, 0.5]}>
        <boxGeometry args={[0.5, 1, 1.5]} />
        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.6} />
      </mesh>
      {/* Runway stripes */}
      <mesh position={[0, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 5.6]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
    </group>
  );
}

function ScrollingCarriers() {
  const ref1 = useRef<THREE.Group>(null);
  const ref2 = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref1.current) {
      ref1.current.position.z += dt * 6;
      if (ref1.current.position.z > 6) ref1.current.position.z = -30;
    }
    if (ref2.current) {
      ref2.current.position.z += dt * 6;
      if (ref2.current.position.z > 6) ref2.current.position.z = -30;
    }
  });
  return (
    <>
      <group ref={ref1} position={[0, 0, -10]}><Carrier z={0} /></group>
      <group ref={ref2} position={[0, 0, -22]}><Carrier z={0} /></group>
    </>
  );
}

function Scene({
  flying,
  busted,
  items,
  onCollectCoin,
  onHitRocket,
}: {
  flying: boolean;
  busted: boolean;
  items: SceneItem[];
  onCollectCoin: (id: number, value: number) => void;
  onHitRocket: (id: number) => void;
}) {
  return (
    <>
      <color attach="background" args={["#0c2d4a"]} />
      <fog attach="fog" args={["#0c2d4a", 12, 35]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 8, 4]} intensity={1.4} castShadow />
      <Environment preset="sunset" />

      <Clouds material={THREE.MeshBasicMaterial}>
        <Cloud seed={1} bounds={[10, 2, 6]} volume={6} color="#dbeafe" position={[-4, 2.5, -8]} />
        <Cloud seed={2} bounds={[10, 2, 6]} volume={6} color="#dbeafe" position={[5, 3, -12]} />
        <Cloud seed={3} bounds={[10, 2, 6]} volume={6} color="#bfdbfe" position={[0, 3.5, -20]} />
      </Clouds>

      <Sea />
      <ScrollingCarriers />

      <Float speed={2} floatIntensity={0.4} rotationIntensity={0.2}>
        <Plane flying={flying} busted={busted} />
      </Float>

      {items.map((it) =>
        it.kind === "coin" ? (
          <Coin
            key={it.id}
            value={it.value}
            position={[it.x, it.y, it.z]}
            onCollect={() => onCollectCoin(it.id, it.value)}
          />
        ) : (
          <Rocket
            key={it.id}
            position={[it.x, it.y, it.z]}
            onHit={() => onHitRocket(it.id)}
          />
        ),
      )}
    </>
  );
}

// ---------- Main page ----------

export default function Aviamasters() {
  useTrackGame("aviamasters");
  const { profile, setLocalCoins } = useUserProfile();
  const [bet, setBet] = useState(10);
  const [pace, setPace] = useState<Pace>("normal");
  const [flying, setFlying] = useState(false);
  const [busted, setBusted] = useState(false);
  const [mult, setMult] = useState(1);
  const [items, setItems] = useState<SceneItem[]>([]);
  const [history, setHistory] = useState<{ mult: number; won: boolean }[]>([]);

  const tickRef = useRef<number | null>(null);
  const idRef = useRef(0);
  const stakeRef = useRef(0);
  const multRef = useRef(1);

  useEffect(() => () => stopTicker(), []);

  function stopTicker() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function spawn(cfg: typeof PACE_CFG.normal) {
    const r = Math.random();
    let kind: "coin" | "rocket" | null = null;
    if (r < cfg.rocketChance) kind = "rocket";
    else if (r < cfg.rocketChance + cfg.coinChance) kind = "coin";
    if (!kind) return;

    const value =
      kind === "coin"
        ? +(cfg.coinGain[0] + Math.random() * (cfg.coinGain[1] - cfg.coinGain[0])).toFixed(2)
        : 0;

    setItems((arr) => [
      ...arr.slice(-7),
      {
        id: ++idRef.current,
        kind: kind!,
        z: -16,                              // far ahead
        x: (Math.random() - 0.5) * 1.6,      // mostly in path
        y: 0.6 + (Math.random() - 0.5) * 0.6,
        value,
      },
    ]);
  }

  function handleCollectCoin(id: number, value: number) {
    setItems((arr) => arr.filter((i) => i.id !== id));
    const next = +(multRef.current + value).toFixed(2);
    multRef.current = next;
    setMult(next);
  }
  function handleHitRocket(id: number) {
    setItems((arr) => arr.filter((i) => i.id !== id));
    const next = +(multRef.current * 0.5).toFixed(2);
    multRef.current = next;
    setMult(next);
    if (next < 1) void bust();
  }

  async function start() {
    if (!profile || flying) return;
    if (bet < 1) return toast.error("Bet at least 1 coin");
    if (bet > profile.coins) return toast.error("Not enough coins");

    setBusted(false);
    setItems([]);
    setMult(1);
    multRef.current = 1;
    stakeRef.current = bet;
    setFlying(true);
    setLocalCoins(profile.coins - bet);

    const cfg = PACE_CFG[pace];
    tickRef.current = window.setInterval(() => spawn(cfg), cfg.tickMs);
  }

  async function bust() {
    if (!flying) return;
    stopTicker();
    setFlying(false);
    setBusted(true);
    const stake = stakeRef.current;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "aviamasters",
      _bet_amount: stake,
      _won: false,
      _multiplier: 0,
      _details: { pace, final_mult: multRef.current, outcome: "crashed" },
    });
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    setHistory((h) => [{ mult: multRef.current, won: false }, ...h].slice(0, 10));
    toast.error(`Crashed at ${multRef.current.toFixed(2)}×`);
  }

  async function land() {
    if (!flying) return;
    stopTicker();
    setFlying(false);
    setItems([]);
    const stake = stakeRef.current;
    const finalMult = +multRef.current.toFixed(2);
    const won = finalMult >= 1.0;
    const { data, error } = await supabase.rpc("place_bet", {
      _game: "aviamasters",
      _bet_amount: stake,
      _won: won,
      _multiplier: won ? finalMult : 0,
      _details: { pace, final_mult: finalMult, outcome: "landed" },
    });
    if (error) return toast.error(error.message);
    if (data?.[0]) setLocalCoins(Number(data[0].new_balance));
    const payout = Number(data?.[0]?.payout ?? 0);
    setHistory((h) => [{ mult: finalMult, won }, ...h].slice(0, 10));
    if (won) toast.success(`+${formatCoins(payout - stake)} @ ${finalMult.toFixed(2)}×`);
    else toast.error(`Landed at ${finalMult.toFixed(2)}×`);
  }

  const potentialPayout = Math.floor(stakeRef.current * mult);

  // Stable canvas — avoid re-creating on every render.
  const canvasDpr = useMemo<[number, number]>(() => [1, 1.5], []);

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <PlaneIcon className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> AVIAMASTERS
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Grab coins, dodge rockets, land before you crash.
          </p>
        </div>
        {history.length > 0 && (
          <ul className="flex gap-1.5">
            {history.map((h, i) => (
              <li
                key={i}
                className={`rounded-md px-2 py-1 text-[10px] font-black tabular-nums ${
                  h.won
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : "bg-destructive/15 text-destructive"
                }`}
              >
                {h.mult.toFixed(2)}×
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* 3D scene */}
      <div className="relative h-[340px] overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-xl sm:h-[440px] sm:rounded-3xl">
        <Canvas shadows dpr={canvasDpr} camera={{ position: [0, 1.6, 4.5], fov: 55 }}>
          <Scene
            flying={flying}
            busted={busted}
            items={items}
            onCollectCoin={handleCollectCoin}
            onHitRocket={handleHitRocket}
          />
        </Canvas>

        {/* HUD overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={busted ? "bust" : flying ? "fly" : "idle"}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`text-5xl font-black tabular-nums sm:text-6xl ${
                busted
                  ? "text-destructive drop-shadow-[0_0_24px_hsl(var(--destructive)/0.7)]"
                  : "text-white drop-shadow-[0_0_24px_hsl(var(--primary)/0.7)]"
              }`}
            >
              {mult.toFixed(2)}×
            </motion.div>
          </AnimatePresence>
          {flying && (
            <div className="rounded-full bg-background/60 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-foreground backdrop-blur">
              Potential {formatCoins(potentialPayout)}
            </div>
          )}
          {busted && (
            <div className="rounded-full bg-destructive/30 px-3 py-1 text-xs font-black uppercase tracking-widest text-destructive">
              Crashed
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4">
        <div className="space-y-3">
          <BetControls bet={bet} setBet={setBet} disabled={flying} />

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Pace
            </label>
            <div className="mt-1 grid grid-cols-3 gap-1 rounded-full bg-background/60 p-1">
              {(["slow", "normal", "fast"] as Pace[]).map((p) => (
                <button
                  key={p}
                  onClick={() => !flying && setPace(p)}
                  disabled={flying}
                  className={`rounded-full py-1.5 text-xs font-bold uppercase tracking-widest transition ${
                    pace === p ? "bg-card text-foreground shadow" : "text-muted-foreground"
                  } disabled:opacity-50`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {!flying ? (
            <Button
              onClick={start}
              className="h-11 w-full text-base font-black tracking-wider shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:h-12"
            >
              <PlaneIcon className="mr-2 h-4 w-4" /> TAKE OFF
            </Button>
          ) : (
            <Button
              onClick={land}
              className="h-11 w-full bg-[hsl(var(--success))] text-base font-black tracking-wider text-background hover:bg-[hsl(var(--success))]/90 sm:h-12"
            >
              LAND @ {mult.toFixed(2)}×
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
