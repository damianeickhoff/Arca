"use client";

// Underwater-caustic-style highlight over the dashboard's gradient hero: a
// single wide, soft-edged arch (flat base, one smooth rounded crest) drifting
// slowly back and forth — deliberately not a sine wave or a spotlight cone.
// Vertically it fills the hero's fade band, from 10px below the very top edge
// down to roughly the "Spending by category" row further down the page.
// Purely decorative; sits behind all real content.

export function DashboardFlowGlow() {
  return (
    <div aria-hidden className="absolute inset-x-0 top-0 h-[34rem] overflow-hidden pointer-events-none -z-50">
      <div className="caustic-band">
        <div className="caustic-mover" />
      </div>
      <style jsx>{`
        .caustic-band {
          position: absolute;
          top: 10px;
          left: 0;
          right: 0;
          bottom: 0;
        }
        .caustic-mover {
          position: absolute;
          top: 0;
          left: -15%;
          width: 70%;
          /* Extends past the band's own bottom edge — the blurred top and
             sides already look soft because they have room to feather into
             transparent space outside the box; the flat bottom didn't,
             since it sat flush against the band's overflow-hidden clip line.
             Pushing it further down means only the already-faded tail of
             the blur is ever visible, so it softens the same way the rest
             of the shape does without touching the shape's own fill. */
          height: calc(100% + 140px);
          background: rgba(0,0,0,0.50);
          /* Half-ellipse top (rounded dome, full width/height) + flat bottom —
             scales cleanly with the box's own width/height, unlike an SVG
             viewBox stretched non-uniformly across a tall, narrow area. */
          border-radius: 50% 50% 0 0 / 100% 100% 0 0;
          filter: blur(40px);
          mix-blend-mode: screen;
          animation:
            caustic-drift 18s ease-in-out infinite alternate,
            caustic-shimmer 6s ease-in-out infinite,
            caustic-morph 20s ease-in-out infinite;
        }
          @keyframes caustic-morph {
            0%, 100% {
              border-radius: 50% 50% 0 0 / 100% 100% 0 0;
              transform: scaleX(1) scaleY(1);
            }

            25% {
              border-radius: 60% 40% 0 0 / 90% 110% 0 0;
              transform: scaleX(1.08) scaleY(0.88);
            }

            50% {
              border-radius: 40% 60% 0 0 / 110% 90% 0 0;
              transform: scaleX(0.95) scaleY(1.12);
            }

            75% {
              border-radius: 55% 45% 0 0 / 95% 105% 0 0;
              transform: scaleX(1.04) scaleY(0.94);
            }
          }         
          @keyframes caustic-drift {
            0% {
              left: -15%;
            }

            50% {
              left: 20%;
            }

            100% {
              left: 45%;
            }
          }
        @keyframes caustic-shimmer {
          0%, 100% { opacity: 0.44; }
          50% { opacity: 0.44; }
        }
        @media (prefers-reduced-motion: reduce) {
          .caustic-mover { animation: none; opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
