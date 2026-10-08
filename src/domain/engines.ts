import { containsPhrase } from "./foundation/analysis";
export { syllables, rhymeKey, containsPhrase } from "./foundation/analysis";
export { analyzeSection } from "./legacy-analysis";
import { seededRandom } from "./legacy-random";
export { seededRandom } from "./legacy-random";
export { normalizeWeights, resolveStyle, compileStyle } from "./legacy-style";
import { dialectMaps, claims } from "./legacy-pack";
import { palette } from "./data";
import type {
  LanguageProfile,
  Project,
  SongSection,
} from "./types";
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
