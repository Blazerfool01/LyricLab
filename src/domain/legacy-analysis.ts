/** Compatibility analyzer: retains v0.1 warning order and preset precedence. */
import {syllables, rhymeKey, containsPhrase} from "./foundation/analysis";
import {cadenceRanges} from "./data";
import type {SongSection, LanguageProfile} from "./types";
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
