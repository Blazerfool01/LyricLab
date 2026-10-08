import { legacyGenreView } from "./foundation/catalogs";
import { traitConflicts } from "./data";
import { seededRandom } from "./legacy-random";
import type {StyleSpec, WeightedSelection, PromptFormat} from "./types";
const unique = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((x) => x.trim())
    .filter((x) => {
      const key = x.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};
export function normalizeWeights(values: WeightedSelection[]) {
  const valid = values.filter((x) => Number.isFinite(x.weight) && x.weight > 0);
  const sum = valid.reduce((n, x) => n + x.weight, 0);
  return valid
    .map((x) => ({ ...x, weight: (x.weight / sum) * 100 }))
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
}
export function resolveStyle(style: StyleSpec, seed: number) {
  const random = seededRandom(seed);
  const blend = normalizeWeights(
    style.genres.filter((g) => legacyGenreView.get(g.id) !== undefined),
  )
    .map((g) => ({ ...g, genre: legacyGenreView.get(g.id) }))
    .filter((g) => g.genre);
  const warnings: string[] = [];
  if (!blend.length)
    warnings.push("Choose at least one genre to give your sound a foundation.");
  if (style.bpm < 40 || style.bpm > 240 || !Number.isFinite(style.bpm))
    warnings.push("Tempo should be between 40 and 240 BPM.");
  for (const g of blend)
    if (
      g.weight >= 40 &&
      (style.bpm < g.genre!.bpm[0] || style.bpm > g.genre!.bpm[1])
    )
      warnings.push(
        `${style.bpm} BPM is outside the usual ${g.genre!.name.toLowerCase()} range. This can be an intentional choice.`,
      );
  const moodNames = normalizeWeights(style.moods).map((x) => x.id);
  for (const conflict of traitConflicts) {
    const selected = conflict.domain === "moods" ? moodNames : style.production;
    if (conflict.pair.every((trait) => selected.includes(trait)))
      warnings.push(conflict.guidance);
  }
  const descriptors = blend.flatMap((g, i) => {
    const d = g.genre!.descriptors;
    return i === 0
      ? [d[0], d[1 + Math.floor(random() * (d.length - 1))]]
      : g.weight >= 15
        ? [d[1 + Math.floor(random() * (d.length - 1))]]
        : [];
  });
  return {
    blend,
    descriptors: unique(descriptors),
    moods: moodNames,
    warnings,
  };
}
export function compileStyle(
  style: StyleSpec,
  seed: number,
  format: PromptFormat = "Compact",
) {
  return renderLegacyStyle({style, seed, resolved: resolveStyle(style, seed)}, format);
}
/** Pure rendering receives complete resolved choices; it performs no lookup/RNG. */
export function renderLegacyStyle(input: {style: StyleSpec; seed: number; resolved: ReturnType<typeof resolveStyle>}, format: PromptFormat) {
  const {style, seed, resolved} = input;
  const names = resolved.blend.map((g) => g.genre!.name.toLowerCase());
  const foundation =
    names.length > 1
      ? `${names[0]} with ${names.slice(1).join(" and ")} influences`
      : names[0] || "Genre-neutral";
  const allSound = unique([
    ...resolved.descriptors,
    ...style.instrumentation.map((x) => x.toLowerCase()),
    ...style.drums.map((x) => x.toLowerCase()),
    ...style.bass.map((x) => x.toLowerCase()),
  ]);
  const sound = allSound.filter(
    (value) =>
      !allSound.some(
        (other) =>
          other !== value && other.toLowerCase().includes(value.toLowerCase()),
      ),
  );
  const voice = unique([
    style.voice.register,
    ...style.voice.texture,
    ...style.voice.delivery,
    style.voice.type,
  ])
    .join(", ")
    .toLowerCase();
  const production = unique([...style.production, ...style.mix])
    .join(", ")
    .toLowerCase();
  const compact = `${foundation[0].toUpperCase() + foundation.slice(1)}. ${resolved.moods.join(", ").toLowerCase() || "Balanced"} mood, ${style.bpm} BPM, ${style.rhythm.toLowerCase()}. ${sound.join(", ")}. ${style.voice.type === "Instrumental" ? "Instrumental; no vocals" : voice + " vocals"}. ${production} production.`;
  if (format === "Compact") return compact;
  const blocks = [
    `STYLE\n${foundation}. ${resolved.descriptors.join("; ")}.`,
    `FEEL & RHYTHM\n${resolved.moods.join(", ")}. ${style.bpm} BPM, ${style.rhythm}.`,
    `VOICE\n${voice}.`,
    `ARRANGEMENT\n${sound.join(", ")}.`,
    `PRODUCTION\n${production}.`,
  ];
  if (format === "Annotated")
    blocks.push(
      `BLUEPRINT NOTES\nSeed: ${seed}. Blend: ${resolved.blend.map((g) => `${g.genre!.name} ${Math.round(g.weight)}%`).join(" / ")}.\n${resolved.warnings.join("\n") || "No style conflicts detected."}`,
    );
  return blocks.join("\n\n");
}
