import { describe, expect, it } from 'vitest';
import baselineJSON from './fixtures/legacy-v0.1.json';
import {
  analyzeSection,
  compileStyle,
  dialectPreview,
  generateLines,
  normalizeWeights,
  resolveStyle,
  rhymeKey,
  seededRandom,
  syllables,
} from './engines';
import { lyricsText, validateProject } from './project';
import type { LanguageProfile, Project, PromptFormat, SongSection } from './types';

// Every expected value below is a checked-in literal captured from 514c7f8.
// Freezing inputs prevents incidental mutations from masking characterization failures.
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
const baseline = freezeDeep(baselineJSON);
const project = baseline.input.project as unknown as Project;
const withLanguage = (language: unknown): Project => ({
  ...project,
  language: language as LanguageProfile,
});

// This suite pins legacy behavior, including limitations. It is not the target
// semantic engine's acceptance suite and must not be refreshed automatically.
describe('legacy-v0.1 / baseline 514c7f8', () => {
  it('pins the eight-value RNG vector and fixture profile', () => {
    expect(baseline.metadata.baselineCommit).toBe('514c7f8');
    expect(baseline.metadata.behaviorProfile).toBe('legacy-v0.1');
    const random = seededRandom(baseline.rng.seed);
    expect(Array.from({ length: baseline.rng.expected.length }, () => random()))
      .toEqual(baseline.rng.expected);
  });

  it('pins normalization, invalid-weight filtering and stable tie order', () => {
    expect(normalizeWeights(baseline.weights.input)).toEqual(baseline.weights.expected);
  });

  it.each(baseline.styles)('pins style resolution and every prompt format: $id', entry => {
    const style = entry.style as Project['style'];
    expect(resolveStyle(style, entry.seed)).toEqual(entry.expected.resolved);
    for (const format of ['Compact', 'Detailed', 'Annotated'] as PromptFormat[]) {
      expect(compileStyle(style, entry.seed, format)).toBe(entry.expected.prompts[format]);
    }
  });

  it.each(baseline.hooks)('pins hook archetype and explicit seed: $archetype / $seed', entry => {
    expect(generateLines(
      project,
      entry.section as SongSection,
      entry.seed,
      false,
      entry.archetype as 'title-drop' | 'refrain' | 'statement',
    )).toEqual(entry.expected);
  });

  it.each(baseline.verses)('pins theme, perspective and cadence text: $id', entry => {
    expect(generateLines(
      withLanguage(entry.language),
      entry.section as SongSection,
      entry.seed,
    )).toEqual(entry.expected);
  });

  it.each(baseline.replacements)('pins regeneration protection: $id', entry => {
    const section = entry.section as SongSection;
    const result = generateLines(withLanguage(entry.language), section, entry.seed, entry.replaceAuthored);
    expect(result).toEqual(entry.expected);
    section.lines.forEach((line, index) => {
      if (section.locked || line.locked || (line.authored && !entry.replaceAuthored)) {
        expect(result[index]).toBe(line);
      }
    });
    if (entry.id === 'zero-candidates-preserve-entire-array') expect(result).toBe(section.lines);
  });

  it.each(baseline.analyses)('pins complete manual analysis report: $id', entry => {
    expect(analyzeSection(entry.section as SongSection, entry.language as LanguageProfile))
      .toEqual(entry.expected);
  });

  it('pins pronunciation estimates and known/fallback end-rhyme keys', () => {
    for (const entry of baseline.syllables) expect(syllables(entry.text)).toBe(entry.expected);
    for (const entry of baseline.rhymes) expect(rhymeKey(entry.text)).toBe(entry.expected);
  });

  it('pins whole-word dialect rendering at every strength, including unchanged tiers', () => {
    for (const entry of baseline.dialects) {
      for (const output of entry.outputs) {
        expect(dialectPreview(entry.text, entry.pack, output.strength)).toBe(output.text);
      }
    }
  });

  it('pins complete valid serialization, round-trip and both lyric exports', () => {
    const loaded = validateProject(project);
    expect(loaded).toEqual(baseline.serialization.expectedProject);
    expect(JSON.stringify(loaded)).toBe(baseline.serialization.expectedJSON);
    expect(validateProject(JSON.parse(baseline.serialization.expectedJSON)))
      .toEqual(baseline.serialization.expectedProject);
    expect(lyricsText(project)).toBe(baseline.serialization.plain);
    expect(lyricsText(project, true)).toBe(baseline.serialization.annotated);
  });
});
