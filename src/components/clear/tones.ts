// The Clear palette's pastel tones, shared by chips, icon tiles and stat tiles so a
// "mint" thing looks the same everywhere. Each tone is a soft fill with its own ink;
// "ember" is the one saturated fill (ink text), "ink" the inverted black capsule.

export type ClearTone =
  | "neutral"
  | "mint"
  | "peach"
  | "sky"
  | "lilac"
  | "butter"
  | "rose"
  | "stone"
  | "ember"
  | "ink";

export const TONE_FILL: Record<ClearTone, string> = {
  neutral: "bg-clear-tile text-clear-ink",
  mint: "bg-clear-mint text-clear-mint-ink",
  peach: "bg-clear-peach text-clear-peach-ink",
  sky: "bg-clear-sky text-clear-sky-ink",
  lilac: "bg-clear-lilac text-clear-lilac-ink",
  butter: "bg-clear-butter text-clear-butter-ink",
  rose: "bg-clear-rose text-clear-rose-ink",
  stone: "bg-clear-stone text-clear-stone-ink",
  ember: "bg-clear-ember text-clear-ember-ink",
  ink: "bg-clear-primary text-clear-primary-ink",
};
