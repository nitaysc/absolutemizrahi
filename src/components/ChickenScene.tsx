import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera, Environment, Float } from "@react-three/drei";
import * as THREE from "three";

/**
 * 3D Chicken scene — Stake-style "Chicken Cross" presentation.
 * Pure presentation: state is driven by props, all game logic lives in the page.
 *
 * Layout: lanes go forward along +Z. Chicken sits on lane index `step`.
 * Each lane has a manhole-style multiplier puck and dashed road markings.
 */

export type LaneState = "hidden" | "safe" | "death";

interface Props {
  totalLanes: number;
  step: number; // 0..totalLanes (chicken position)
  lanes: LaneState[];
  multipliers: number[];
  dead: boolean;
  active: boolean;
  /** Lane index of the car that hit the chicken (only set on death). */
  deathLane?: number | null;
  /** True after a successful cashout — used to flag the would-have-died lane. */
  cashedOut?: boolean;
  /** Index of the next death lane after cashout (for "you would have died here" marker). */
  nextDeathLane?: number | null;
}

const LANE_DEPTH = 3.2;

export function ChickenScene(props: Props) {
  return (
    <div className="relative h-[200px] w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-zinc-900 via-zinc-950 to-black sm:h-[240px] sm:rounded-3xl">
      <Canvas shadows dpr={[1, 1.8]}>
        <PerspectiveCamera makeDefault fov={50} position={[5, 5.5, -5]} />
        <CameraRig step={props.step} />
        <ambientLight intensity={0.45} />
        <directionalLight
          position={[10, 14, 6]}
          intensity={1.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <hemisphereLight args={["#7dd3fc", "#1f2937", 0.35]} />
        <Environment preset="city" />

        <Scene {...props} />
      </Canvas>

      {/* Foreground UI overlay: current multiplier badge */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-primary/40 bg-background/70 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-primary backdrop-blur-md">
        {props.active && !props.dead && props.step > 0
          ? `${(props.multipliers[props.step - 1] ?? 1).toFixed(2)}×`
          : "READY"}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */

function CameraRig({ step }: { step: number }) {
  // Camera trails the chicken so the active lane stays centered.
  // Sit ~5 units behind the chicken's current lane and look slightly ahead.
  useFrame(({ camera }) => {
    const chickenZ = step * LANE_DEPTH;
    const targetCamZ = chickenZ - 5;
    camera.position.z += (targetCamZ - camera.position.z) * 0.1;
    camera.position.x += (5 - camera.position.x) * 0.1;
    camera.position.y += (5.5 - camera.position.y) * 0.1;
    camera.lookAt(0, 0.6, chickenZ + LANE_DEPTH);
  });
  return null;
}

function Scene({ totalLanes, step, lanes, multipliers, dead, active }: Props) {
  return (
    <group>
      {/* Sidewalk start */}
      <Sidewalk z={-LANE_DEPTH} label="START" color="#10b981" />
      {/* Sidewalk end */}
      <Sidewalk z={totalLanes * LANE_DEPTH} label="WIN" color="#f59e0b" />

      {/* Lanes */}
      {Array.from({ length: totalLanes }).map((_, i) => (
        <Lane
          key={i}
          z={i * LANE_DEPTH}
          state={lanes[i] ?? "hidden"}
          multiplier={multipliers[i] ?? 1}
          highlight={active && !dead && i === step}
        />
      ))}

      {/* Chicken */}
      <Chicken z={step * LANE_DEPTH - LANE_DEPTH} dead={dead} />

      {/* Cars whooshing across in the background for ambience */}
      <AmbientTraffic totalLanes={totalLanes} />
    </group>
  );
}

/* --------------------- Pieces --------------------- */

function Sidewalk({ z, label, color }: { z: number; label: string; color: string }) {
  return (
    <group position={[0, 0, z]}>
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[6, 0.4, LANE_DEPTH]} />
        <meshStandardMaterial color="#1f2937" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.21, 0]}>
        <boxGeometry args={[5.6, 0.02, LANE_DEPTH - 0.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[-2.6, 0.4, 0]}>
        <boxGeometry args={[0.2, 0.4, LANE_DEPTH]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[2.6, 0.4, 0]}>
        <boxGeometry args={[0.2, 0.4, LANE_DEPTH]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {/* label is rendered via DOM overlay externally; keep scene clean */}
      <pointLight position={[0, 1.2, 0]} intensity={0.4} color={color} distance={4} />
      <Letters text={label} z={0} />
    </group>
  );
}

function Letters({ text, z }: { text: string; z: number }) {
  // Cheap "text" using a glowing strip; avoids font loading.
  return (
    <mesh position={[0, 0.25, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.4 + text.length * 0.1, 0.4]} />
      <meshStandardMaterial
        color="#0f172a"
        emissive="#fef3c7"
        emissiveIntensity={0.4}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function Lane({
  z,
  state,
  multiplier,
  highlight,
}: {
  z: number;
  state: LaneState;
  multiplier: number;
  highlight: boolean;
}) {
  const stripeRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (highlight && stripeRef.current) {
      const m = stripeRef.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity =
        0.7 + 0.4 * Math.sin(performance.now() * 0.005);
      stripeRef.current.scale.x = 1 + 0.02 * Math.sin(performance.now() * 0.004);
    }
  });

  return (
    <group position={[0, 0, z]}>
      {/* Asphalt */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[6, 0.4, LANE_DEPTH]} />
        <meshStandardMaterial color="#27272a" roughness={1} />
      </mesh>
      {/* Side curbs */}
      <mesh position={[-2.6, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.2, LANE_DEPTH]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[2.6, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.2, LANE_DEPTH]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      {/* Dashed center line */}
      {[-LANE_DEPTH / 2 + 0.3, 0, LANE_DEPTH / 2 - 0.3].map((dz, i) => (
        <mesh key={i} position={[0, 0.21, dz]}>
          <boxGeometry args={[0.15, 0.02, 0.5]} />
          <meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={0.2} />
        </mesh>
      ))}

      {/* Multiplier puck (manhole) */}
      <Float speed={2} rotationIntensity={0.2} floatIntensity={highlight ? 0.3 : 0.05}>
        <group position={[0, 0.45, 0]}>
          <mesh ref={stripeRef} castShadow>
            <cylinderGeometry args={[0.55, 0.55, 0.12, 32]} />
            <meshStandardMaterial
              color={
                state === "death"
                  ? "#7f1d1d"
                  : state === "safe"
                    ? "#065f46"
                    : highlight
                      ? "#1e3a8a"
                      : "#18181b"
              }
              emissive={
                state === "death"
                  ? "#ef4444"
                  : state === "safe"
                    ? "#10b981"
                    : highlight
                      ? "#3b82f6"
                      : "#000"
              }
              emissiveIntensity={highlight ? 0.8 : state !== "hidden" ? 0.5 : 0.15}
              metalness={0.4}
              roughness={0.5}
            />
          </mesh>
          {/* Multiplier label as a glowing ring */}
          <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.32, 0.5, 32]} />
            <meshStandardMaterial
              color="#fafafa"
              emissive="#fafafa"
              emissiveIntensity={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </Float>

      {/* Death car */}
      {state === "death" && <CrashedCar />}

      {/* Multiplier text overlay using HTML inside Canvas isn't available here;
          we encode value in the scale of a small bar so players still see relative magnitude. */}
      <MultiplierBar value={multiplier} />
    </group>
  );
}

function MultiplierBar({ value }: { value: number }) {
  // Visual hint of payout magnitude — log-scaled bar, capped.
  const h = Math.min(2.4, 0.1 + Math.log2(Math.max(1, value)) * 0.3);
  return (
    <mesh position={[2.95, h / 2, 0]}>
      <boxGeometry args={[0.06, h, 0.3]} />
      <meshStandardMaterial
        color="#facc15"
        emissive="#facc15"
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

function CrashedCar() {
  return (
    <group position={[0, 0.7, 0]} rotation={[0, 0.3, 0.1]}>
      <mesh castShadow>
        <boxGeometry args={[1.6, 0.7, 0.9]} />
        <meshStandardMaterial color="#dc2626" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.0, 0.45, 0.85]} />
        <meshStandardMaterial color="#7f1d1d" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Wheels */}
      {[
        [-0.6, -0.35, 0.5],
        [0.6, -0.35, 0.5],
        [-0.6, -0.35, -0.5],
        [0.6, -0.35, -0.5],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.18, 16]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
      ))}
      <pointLight color="#ef4444" intensity={0.8} distance={3} position={[0, 0.5, 0]} />
    </group>
  );
}

function Chicken({ z, dead }: { z: number; dead: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const targetZ = useRef(z);
  targetZ.current = z;
  const hop = useRef(0);

  useFrame((_, dt) => {
    if (!ref.current) return;
    // Smooth hop forward to current lane.
    const cur = ref.current.position.z;
    const dz = targetZ.current - cur;
    ref.current.position.z += dz * 0.15;
    if (Math.abs(dz) > 0.05) {
      hop.current = Math.min(hop.current + dt * 6, Math.PI);
    } else {
      hop.current = 0;
    }
    ref.current.position.y = dead ? 0.3 : 0.6 + Math.sin(hop.current) * 0.4;
    ref.current.rotation.y = dead ? Math.PI / 2 : 0;
    ref.current.rotation.z = dead ? Math.PI / 2 : 0;
  });

  return (
    <group ref={ref} position={[0, 0.6, z]} scale={dead ? 0.7 : 1}>
      {/* Body */}
      <mesh castShadow>
        <sphereGeometry args={[0.45, 16, 12]} />
        <meshStandardMaterial color="#fde047" roughness={0.6} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.45, 0.25]} castShadow>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshStandardMaterial color="#fde047" roughness={0.6} />
      </mesh>
      {/* Beak */}
      <mesh position={[0, 0.4, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.1, 0.22, 8]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      {/* Comb */}
      <mesh position={[0, 0.72, 0.18]}>
        <boxGeometry args={[0.06, 0.18, 0.22]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.13, 0.5, 0.45]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[-0.13, 0.5, 0.45]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>
      {/* Legs */}
      <mesh position={[0.15, -0.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.4]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <mesh position={[-0.15, -0.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.4]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <pointLight color="#fef08a" intensity={0.6} distance={2.5} />
    </group>
  );
}

function AmbientTraffic({ totalLanes }: { totalLanes: number }) {
  // A few decorative cars zooming across the side of the road for ambiance.
  const cars = useMemo(
    () =>
      Array.from({ length: 4 }).map((_, i) => ({
        z: (i / 4) * totalLanes * LANE_DEPTH,
        speed: 4 + Math.random() * 3,
        offset: Math.random() * 12,
        color: ["#3b82f6", "#22c55e", "#a855f7", "#ec4899"][i % 4],
      })),
    [totalLanes],
  );
  return (
    <group>
      {cars.map((c, i) => (
        <PassingCar key={i} {...c} />
      ))}
    </group>
  );
}

function PassingCar({
  z,
  speed,
  offset,
  color,
}: {
  z: number;
  speed: number;
  offset: number;
  color: string;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (!ref.current) return;
    ref.current.position.x -= speed * dt;
    if (ref.current.position.x < -8) ref.current.position.x = 8 + offset;
  });
  return (
    <group ref={ref} position={[8, 0.5, z + LANE_DEPTH * 0.5]}>
      <mesh>
        <boxGeometry args={[0.9, 0.4, 0.5]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
      </mesh>
      <pointLight color={color} intensity={0.4} distance={1.6} />
    </group>
  );
}