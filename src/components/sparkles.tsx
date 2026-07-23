import React from "react";
// "Underwater light" hero decoration for the settings dialog's first page: a few
// soft colored light beams swaying slowly from the top, with tiny particles rising
// through them at scattered depths. Positions/timings are hand-placed (not random)
// so the effect looks designed and stays stable across re-renders.

const BEAMS = [
  { color: "rgba(90, 150, 255, 0.24)", rotate: -2, x: "5%",  width: 180, delay: "0s",   duration: "13s" },
  { color: "rgba(255, 220, 150, 0.20)", rotate: 1,  x: "18%", width: 210, delay: "1.8s", duration: "15s" },
  { color: "rgba(255, 255, 255, 0.18)", rotate: -1, x: "31%", width: 170, delay: "0.6s", duration: "12s" },
  { color: "rgba(255, 190, 95, 0.18)", rotate: 2,  x: "43%", width: 200, delay: "2.5s", duration: "14s" },
  { color: "rgba(85, 170, 255, 0.22)", rotate: -2, x: "56%", width: 230, delay: "1.2s", duration: "16s" },
  { color: "rgba(255, 215, 130, 0.22)", rotate: 1,  x: "68%", width: 190, delay: "3.2s", duration: "11s" },
  { color: "rgba(120, 205, 255, 0.20)", rotate: -1, x: "80%", width: 220, delay: "2s", duration: "13s" },
  { color: "rgba(255, 235, 180, 0.15)", rotate: 2,  x: "94%", width: 160, delay: "4s", duration: "15s" },
];
// `top`/`rise` are scattered (not all anchored to one shared baseline) so the
// particles read as rising from varied depths instead of popping in along a
// single visible line at the bottom of the box.
const PARTICLES = [
  { left: "6%",  top: "82%", size: 1.5, rise: 120, delay: "-1.7s", duration: "8.4s" },
  { left: "11%", top: "46%", size: 2,   rise: 75,  delay: "-5.3s", duration: "6.9s" },
  { left: "18%", top: "68%", size: 1,   rise: 155, delay: "-0.6s", duration: "10.2s" },
  { left: "23%", top: "30%", size: 2.5, rise: 100, delay: "-7.8s", duration: "7.5s" },

  { left: "31%", top: "88%", size: 1.5, rise: 85,  delay: "-3.4s", duration: "8.8s" },
  { left: "36%", top: "58%", size: 2,   rise: 170, delay: "-6.7s", duration: "11s" },
  { left: "43%", top: "22%", size: 1,   rise: 130, delay: "-2.1s", duration: "9.3s" },
  { left: "48%", top: "76%", size: 2.5, rise: 95,  delay: "-8.4s", duration: "7.1s" },

  { left: "54%", top: "50%", size: 1.5, rise: 145, delay: "-4.8s", duration: "10.5s" },
  { left: "59%", top: "90%", size: 1,   rise: 70,  delay: "-1.3s", duration: "6.6s" },
  { left: "64%", top: "34%", size: 2,   rise: 180, delay: "-9.1s", duration: "12s" },
  { left: "69%", top: "65%", size: 1.5, rise: 110, delay: "-3.9s", duration: "8.1s" },

  { left: "76%", top: "25%", size: 2.5, rise: 140, delay: "-6.2s", duration: "9.7s" },
  { left: "81%", top: "74%", size: 1,   rise: 90,  delay: "-0.8s", duration: "7.4s" },
  { left: "87%", top: "52%", size: 2,   rise: 160, delay: "-5.7s", duration: "10.8s" },
  { left: "94%", top: "84%", size: 1.5, rise: 100, delay: "-2.9s", duration: "8.6s" },

  { left: "15%", top: "15%", size: 1,   rise: 190, delay: "-8.5s", duration: "13s" },
  { left: "39%", top: "12%", size: 1.5, rise: 150, delay: "-4.2s", duration: "11.5s" },
  { left: "72%", top: "18%", size: 1,   rise: 170, delay: "-7.4s", duration: "12.2s" },
  
];

function Beam({
  color,
  rotate,
  x,
  width,
  delay,
  duration,
}: {
  color: string;
  rotate: number;
  x: string;
  width: number;
  delay: string;
  duration: string;
}) {
  return (
    <div
      aria-hidden
      className="sparkle-beam absolute -top-3 h-full"
      style={{
        left: x,
        width,
        marginLeft: -width / 2,
        transformOrigin: "top center",
        background: `
          linear-gradient(
            to bottom,
            ${color},
            transparent 80%
          )
        `,
        filter: "blur(25px)",
        opacity: 0.5,
        mixBlendMode: "screen",
        "--beam-rot": `${rotate}deg`,
        animation: `sparkle-beam-sway ${duration} ease-in-out infinite`,
        animationDelay: "-2.4s",
      } as React.CSSProperties}
    />
  );
}

function Particle({ left, top, size, rise, delay, duration }: { left: string; top: string; size: number; rise: number; delay: string; duration: string }) {
  return (
    <span
      aria-hidden
      className="sparkle-rise absolute rounded-full bg-[#fff]/40" 
      style={{
        left,
        top,
        width: size,
        height: size,
        "--rise": `${rise}px`,
        animation: `sparkle-rise ${duration} ease-in-out infinite`,
        animationDelay: delay,
      } as React.CSSProperties}
    />
  );
}

/** Decorative-only colored light beams + rising particles — render inside a
 * `relative` container; sizes itself to a fixed hero height rather than the
 * parent's full height, so it stays confined to the top block. */
export function Sparkles() {
  const particles = React.useMemo(
    () =>
      PARTICLES.map((p) => ({
        ...p,
        delay: `${-(Math.random() * parseFloat(p.duration))}s`,
      })),
    []
  );

  return (
    <div aria-hidden className="absolute inset-x-0 top-0 h-80 pointer-events-none overflow-hidden -z-10">
      {BEAMS.map((b, i) => (
        <Beam key={i} {...b} />
      ))}

      {particles.map((p, i) => (
        <Particle key={i} {...p} />
      ))}
    </div>
  );
}