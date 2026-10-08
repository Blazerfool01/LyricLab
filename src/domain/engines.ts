import { legacyGenreView } from "./foundation/catalogs";
import { exceptions, rhymeSets, dialectMaps } from "./legacy-pack";
import { cadenceRanges, palette, traitConflicts } from "./data";
import type {
  LanguageProfile,
  Project,
  PromptFormat,
  SongSection,
  StyleSpec,
  WeightedSelection,
} from "./types";
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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
  const resolved = resolveStyle(style, seed);
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
export function syllables(text: string) {
  return (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []).reduce(
    (sum, word) => {
      if (exceptions[word]) return sum + exceptions[word];
      if (word.length <= 3) return sum + 1;
      const clean = word
        .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
        .replace(/^y/, "");
      return sum + Math.max(1, (clean.match(/[aeiouy]{1,2}/g) || []).length);
    },
    0,
  );
}
export function rhymeKey(text: string) {
  const word =
    text
      .toLowerCase()
      .match(/[a-z]+/g)
      ?.at(-1) || "";
  const group = rhymeSets.findIndex((g) => g.includes(word));
  return group >= 0
    ? `known-${group}`
    : word.match(/[aeiouy][^aeiouy]*$/)?.[0] || word;
}
export function analyzeSection(
  section: SongSection,
  language: LanguageProfile,
) {
  const keys = section.lines.map((l) => rhymeKey(l.text));
  const distinct = unique(keys.filter(Boolean));
  const scheme = keys
    .map((k) => (k ? String.fromCharCode(65 + distinct.indexOf(k)) : "–"))
    .join("");
  const range = cadenceRanges[section.delivery] || section.syllableRange;
  const banned = language.avoided
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const warnings: { id: string; text: string; lineId: string }[] = [];
  const counts = section.lines.map((l) => syllables(l.text));
  section.lines.forEach((line, i) => {
    if (!line.text.trim()) return;
    if (counts[i] < range[0] || counts[i] > range[1])
      warnings.push({
        id: `${line.id}:meter`,
        text: `Line ${i + 1} has about ${counts[i]} syllables; ${section.delivery.toLowerCase()} delivery usually fits ${range[0]}–${range[1]}.`,
        lineId: line.id,
      });
    for (const word of banned)
      if (containsPhrase(line.text, word))
        warnings.push({
          id: `${line.id}:banned:${word}`,
          text: `Line ${i + 1} includes the avoided phrase “${word}”.`,
          lineId: line.id,
        });
  });
  if (
    scheme &&
    section.rhymeScheme &&
    scheme !==
      section.rhymeScheme
        .repeat(Math.ceil(keys.length / section.rhymeScheme.length))
        .slice(0, keys.length)
  )
    warnings.push({
      id: `${section.id}:rhyme`,
      text: `The estimated rhyme pattern is ${scheme}; your target is ${section.rhymeScheme}. Slant rhymes may be missed.`,
      lineId: "",
    });
  const words = section.lines
    .flatMap((l) => l.text.toLowerCase().match(/[a-z]+/g) || [])
    .filter((w) => w.length > 4);
  const repeated = unique(
    words.filter((w) => words.filter((x) => x === w).length > 2),
  );
  if (repeated.length)
    warnings.push({
      id: `${section.id}:repeat`,
      text: `Repeated words: ${repeated.join(", ")}. Check whether the repetition is intentional.`,
      lineId: "",
    });
  return { counts, scheme, keys, warnings, range };
}
export function containsPhrase(text: string, phrase: string) {
  const escape = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escape}\\b`, "i").test(text);
}
function perspective(text: string, language: LanguageProfile) {
  if (language.perspective === "second")
    return text
      .replace(/\bI am\b/g, "You are")
      .replace(/\bI\b/g, "You")
      .replace(/\bmy\b/g, "your")
      .replace(/\bme\b/g, "you");
  if (language.perspective === "third")
    return text
      .replace(/\bI am\b/g, "They are")
      .replace(/\bI\b/g, "They")
      .replace(/\bmy\b/g, "their")
      .replace(/\bme\b/g, "them");
  return text;
}
export function generateLines(
  project: Project,
  section: SongSection,
  seed: number,
  replaceAuthored = false,
  hookArchetype: "title-drop" | "refrain" | "statement" = "title-drop",
) {
  const random = seededRandom(
    seed + [...section.id].reduce((n, c) => n + c.charCodeAt(0), 0),
  );
  const bank = palette[project.language.theme] || palette["Finding your way"];
  const bans = [
    ...project.language.avoided
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    "heart of gold",
    "chasing dreams",
    "broken wings",
  ];
  const title = project.title || "A new beginning";
  const motif = project.language.motif || bank.objects[0];
  const hooks = [
    `${title}, I follow where you go`,
    `A little ${motif}, a little room to grow`,
    `I do not need the answer just to know`,
    `${title}, I am learning to move slow`,
  ];
  const claims: Record<string, string> = {
    "Finding your way": "I can be uncertain and still go",
    "Love & connection": "I choose the quiet way we learn to stay",
    "Letting go": "I can let you go and keep the care",
    "Ambition & identity": "I get to choose the meaning of my name",
    "Home & belonging": "I make a home in what I choose to keep",
  };
  const claim = claims[project.language.theme] || claims["Finding your way"];
  const refrain = [
    `I follow the ${motif}, soft and slow`,
    `The ${bank.objects[0]} holds a place for what I find`,
    `I follow the ${motif} where I go`,
    `And carry what I choose to leave behind`,
  ];
  const statement = [
    claim,
    `The ${bank.objects[0]} reminds me what I know`,
    `${title}, I leave some room to grow`,
    claim,
  ];
  const hookLines =
    hookArchetype === "refrain"
      ? refrain
      : hookArchetype === "statement"
        ? statement
        : hooks;
  const bridge = [
    `I see the ${motif} in a different way`,
    `What seemed so far is closer than before`,
    `I leave a space for what I cannot say`,
    `And find a reason to try once more`,
  ];
  let candidates =
    section.type === "chorus"
      ? hookLines
      : section.type === "bridge"
        ? bridge
        : bank.lines;
  candidates = candidates
    .map((x) => perspective(x, project.language))
    .filter((x) => !bans.some((b) => containsPhrase(x, b)));
  if (!candidates.length) return section.lines;
  const offset = Math.floor(random() * candidates.length);
  const short =
    section.delivery === "Short / clipped" ||
    section.delivery === "Dragged / spacious";
  const dense =
    section.delivery === "Double-time" || section.delivery === "Dense rhythmic";
  return section.lines.map((line, i) => {
    if (section.locked || line.locked || (line.authored && !replaceAuthored))
      return line;
    let text = candidates[(offset + i) % candidates.length];
    if (short) {
      const chunks = text.split(" ");
      text = chunks.slice(Math.max(0, chunks.length - 6)).join(" ");
      text = text[0].toUpperCase() + text.slice(1);
    }
    if (dense) {
      const extra = `, with the ${motif} beside me`;
      if (!bans.some((b) => containsPhrase(text + extra, b))) text += extra;
    }
    return { ...line, text, authored: false };
  });
}
export function dialectPreview(text: string, pack: string, strength: number) {
  if (pack === "Standard" || strength < 2) return text;
  let result = text;
  for (const [word, replacement] of Object.entries(dialectMaps[pack] || {}))
    result = result.replace(new RegExp(`\\b${word}\\b`, "gi"), replacement);
  if (strength >= 4) result = result.replace(/\bgoing to\b/gi, "gonna");
  return result;
}
