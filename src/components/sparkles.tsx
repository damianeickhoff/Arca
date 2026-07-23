"use client";

import React from "react";

// "Underwater light" hero decoration for the settings dialog's first page: a few
// soft colored light beams swaying slowly from the top, with tiny particles rising
// through them at scattered depths. Positions/timings are hand-placed (not random)
// so the effect looks designed and stays stable across re-renders.

const DARK_BEAMS = [
  { color: "rgba(90, 150, 255, 0.24)", rotate: -2, x: "5%",  width: 180, delay: "0s",   duration: "13s" },
  { color: "rgba(255, 220, 150, 0.20)", rotate: 1,  x: "18%", width: 210, delay: "1.8s", duration: "15s" },
  { color: "rgba(255, 255, 255, 0.18)", rotate: -1, x: "31%", width: 170, delay: "0.6s", duration: "12s" },
  { color: "rgba(255, 190, 95, 0.18)", rotate: 2,  x: "43%", width: 200, delay: "2.5s", duration: "14s" },
  { color: "rgba(85, 170, 255, 0.22)", rotate: -2, x: "56%", width: 230, delay: "1.2s", duration: "16s" },
  { color: "rgba(255, 215, 130, 0.22)", rotate: 1,  x: "68%", width: 190, delay: "3.2s", duration: "11s" },
  { color: "rgba(120, 205, 255, 0.20)", rotate: -1, x: "80%", width: 220, delay: "2s", duration: "13s" },
  { color: "rgba(255, 235, 180, 0.15)", rotate: 2,  x: "94%", width: 160, delay: "4s", duration: "15s" },
];

const LIGHT_BEAMS = [
  { color: "rgba(90, 160, 255, 0.85)", rotate: -2, x: "5%",  width: 180, delay: "0s", duration: "13s" },
  { color: "rgba(255, 200, 120, 0.82)", rotate: 1,  x: "18%", width: 210, delay: "1.8s", duration: "15s" },
  { color: "rgba(180, 220, 255, 0.95)", rotate: -1, x: "31%", width: 170, delay: "0.6s", duration: "12s" },
  { color: "rgba(255, 190, 100, 0.85)", rotate: 2,  x: "43%", width: 200, delay: "2.5s", duration: "14s" },
  { color: "rgba(80, 150, 255, 0.90)", rotate: -2, x: "56%", width: 230, delay: "1.2s", duration: "16s" },
  { color: "rgba(255, 220, 150, 0.85)", rotate: 1,  x: "68%", width: 190, delay: "3.2s", duration: "11s" },
  { color: "rgba(120, 200, 255, 0.88)", rotate: -1, x: "80%", width: 220, delay: "2s", duration: "13s" },
  { color: "rgba(255, 230, 170, 0.85)", rotate: 2,  x: "94%", width: 160, delay: "4s", duration: "15s" },
];
// `top`/`rise` are scattered (not all anchored to one shared baseline) so the
// particles read as rising from varied depths instead of popping in along a
// single visible line at the bottom of the box.
const PARTICLES = [
  { left: "3%", top: "85%", size: 1, rise: 120, delay: "-2s", duration: "9s" },
  { left: "7%", top: "62%", size: 1.5, rise: 180, delay: "-6s", duration: "11s" },
  { left: "10%", top: "35%", size: 2, rise: 90, delay: "-4s", duration: "7s" },
  { left: "14%", top: "78%", size: 1, rise: 160, delay: "-8s", duration: "10s" },
  { left: "17%", top: "20%", size: 1.5, rise: 130, delay: "-3s", duration: "8s" },

  { left: "21%", top: "70%", size: 1, rise: 150, delay: "-5s", duration: "12s" },
  { left: "25%", top: "45%", size: 2, rise: 110, delay: "-9s", duration: "9s" },
  { left: "28%", top: "88%", size: 1.5, rise: 200, delay: "-1s", duration: "13s" },
  { left: "32%", top: "28%", size: 1, rise: 140, delay: "-7s", duration: "8s" },
  { left: "35%", top: "60%", size: 2.5, rise: 170, delay: "-4s", duration: "11s" },

  { left: "39%", top: "82%", size: 1, rise: 100, delay: "-6s", duration: "7s" },
  { left: "42%", top: "40%", size: 1.5, rise: 190, delay: "-2s", duration: "12s" },
  { left: "46%", top: "15%", size: 1, rise: 150, delay: "-8s", duration: "10s" },
  { left: "49%", top: "72%", size: 2, rise: 120, delay: "-3s", duration: "9s" },

  { left: "53%", top: "55%", size: 1, rise: 170, delay: "-5s", duration: "11s" },
  { left: "56%", top: "25%", size: 1.5, rise: 140, delay: "-9s", duration: "8s" },
  { left: "60%", top: "85%", size: 2, rise: 200, delay: "-1s", duration: "13s" },
  { left: "63%", top: "48%", size: 1, rise: 110, delay: "-7s", duration: "9s" },
  { left: "67%", top: "18%", size: 1.5, rise: 160, delay: "-4s", duration: "10s" },

  { left: "71%", top: "75%", size: 1, rise: 130, delay: "-6s", duration: "8s" },
  { left: "74%", top: "38%", size: 2.5, rise: 180, delay: "-2s", duration: "12s" },
  { left: "78%", top: "90%", size: 1, rise: 100, delay: "-8s", duration: "7s" },
  { left: "82%", top: "60%", size: 1.5, rise: 150, delay: "-3s", duration: "11s" },
  { left: "85%", top: "30%", size: 2, rise: 190, delay: "-5s", duration: "13s" },

  { left: "89%", top: "80%", size: 1, rise: 120, delay: "-7s", duration: "9s" },
  { left: "92%", top: "50%", size: 1.5, rise: 170, delay: "-1s", duration: "12s" },
  { left: "96%", top: "22%", size: 2, rise: 140, delay: "-6s", duration: "10s" },

  // deeper background particles
  { left: "12%", top: "92%", size: 1, rise: 220, delay: "-10s", duration: "15s" },
  { left: "30%", top: "95%", size: 1.5, rise: 240, delay: "-12s", duration: "16s" },
  { left: "50%", top: "94%", size: 1, rise: 210, delay: "-14s", duration: "14s" },
  { left: "70%", top: "96%", size: 1.5, rise: 230, delay: "-11s", duration: "15s" },
  { left: "88%", top: "93%", size: 1, rise: 200, delay: "-13s", duration: "14s" },
];

function useDarkMode() {
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const update = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}

function Beam({
  color,
  rotate,
  x,
  width,
  delay,
  duration,
  isDark,
}: {
  color: string;
  rotate: number;
  x: string;
  width: number;
  delay: string;
  duration: string;
  isDark: boolean;
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
        opacity: isDark ? 0.7 : 0.85,
        mixBlendMode: isDark ? "screen" : "normal",
        "--beam-rot": `${rotate}deg`,
        animation: `sparkle-beam-sway ${duration} ease-in-out infinite`,
        animationDelay: "-2.4s",
      } as React.CSSProperties}
    />
  );
}

function Particle({
  left,
  top,
  size,
  rise,
  delay,
  duration,
  isDark,
}: {
  left: string;
  top: string;
  size: number;
  rise: number;
  delay: string;
  duration: string;
  isDark: boolean;
}) {
  return (
    <span
      aria-hidden
      className="sparkle-rise absolute rounded-full"
      style={{
        left,
        top,
        width: size,
        height: size,
        background: isDark
          ? "rgba(255, 230, 150, 0.95)"
          : "rgb(250, 250, 250)",
        boxShadow: isDark
          ? "0 0 8px rgba(255, 220, 120, 0.9)"
          : "0 0 10px rgb(250, 250, 250)",
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
  const isDark = useDarkMode();
  const BEAMS = isDark ? DARK_BEAMS : LIGHT_BEAMS;

  const particles = React.useMemo(
    () =>
      PARTICLES.map((p) => ({
        ...p,
        delay: `${-(Math.random() * parseFloat(p.duration))}s`,
      })),
    []
  );

  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 h-80 pointer-events-none overflow-hidden -z-10"
    >
      {BEAMS.map((b, i) => (
        <Beam key={i} {...b} isDark={isDark} />
      ))}

      {particles.map((p, i) => (
        <Particle key={i} {...p} isDark={isDark} />
      ))}
    </div>
  );
}