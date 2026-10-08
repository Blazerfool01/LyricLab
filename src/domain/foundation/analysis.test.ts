import { describe, expect, it } from 'vitest';
import baseline from '../fixtures/legacy-v0.1.json';
import { containsPhrase, rhymeKey, syllables, textAnalyzer } from './analysis';
import { catalog, freeze, immutableView } from './catalogs';
import { fingerprint } from './randomness';
import type { ContextLine, PronunciationEntry } from './contracts';

const lines = (...texts: string[]): ContextLine[] => texts.map((text, i) => ({ lineId: `line-${i + 1}`, sectionId: 'section-a', text, protected: false }));
const pronunciation = (token: string, syllableCount: number, phonemes: string[] = []): PronunciationEntry => ({ id: `pronunciation:${token}`, token, locale: 'en', syllables: syllableCount, phonemes });

describe('independent text measurements', () => {
  it('retains literal legacy helper syllable/rhyme outputs', () => {
    baseline.syllables.forEach(entry => expect(syllables(entry.text)).toBe(entry.expected));
    baseline.rhymes.forEach(entry => expect(rhymeKey(entry.text)).toBe(entry.expected));
    expect(containsPhrase('A HEART OF GOLD shines', 'heart of gold')).toBe(true);
    expect(containsPhrase('Bright morning', 'right')).toBe(false);
  });

  it('uses injected pronunciation overrides and distinguishes known/estimated/unknown lines', () => {
    const dictionary = immutableView([pronunciation('quiet', 2), pronunciation('people', 2)]);
    expect(textAnalyzer.analyze(lines('Quiet people', 'A wandering road', ''), dictionary).lines).toEqual([
      { lineId: 'line-1', textFingerprint: fingerprint('Quiet people'), syllables: 4, confidence: 'known', endRhymeKey: 'e' },
      { lineId: 'line-2', textFingerprint: fingerprint('A wandering road'), syllables: 5, confidence: 'estimated', endRhymeKey: 'known-14' },
      { lineId: 'line-3', textFingerprint: fingerprint(''), syllables: 0, confidence: 'unknown' },
    ]);
    expect(textAnalyzer.analyze(lines('quiet'), immutableView([pronunciation('quiet', 3)])).lines[0].syllables).toBe(3);
  });

  it('reports unavailable non-Latin pronunciation as unknown rather than invented certainty', () => {
    const report = textAnalyzer.analyze(lines('夜'), catalog.pronunciations);
    expect(report.lines[0]).toEqual({ lineId: 'line-1', textFingerprint: fingerprint('夜'), syllables: 0, confidence: 'unknown' });
  });

  it('recognizes supplied matching ARPABET rhyme tails and slant codas', () => {
    const dictionary = immutableView([
      pronunciation('light', 1, ['L', 'AY1', 'T']), pronunciation('night', 1, ['N', 'AY1', 'T']), pronunciation('life', 1, ['L', 'AY1', 'F']),
    ]);
    expect(textAnalyzer.analyze(lines('light', 'night', 'life'), dictionary).rhymes).toEqual([
      { lineIds: ['line-1', 'line-2'], kind: 'exact', confidence: 1 },
      { lineIds: ['line-1', 'line-3'], kind: 'slant', confidence: 0.7 },
      { lineIds: ['line-2', 'line-3'], kind: 'slant', confidence: 0.7 },
    ]);
  });

  it('keeps spelling-only matches uncertain and mixed legacy groups slant', () => {
    const report = textAnalyzer.analyze(lines('road', 'hold', 'read', 'head', ''), immutableView<PronunciationEntry>([]));
    expect(report.rhymes.find(pair => pair.lineIds[0] === 'line-1' && pair.lineIds[1] === 'line-2')).toMatchObject({ kind: 'slant', confidence: 0.6 });
    expect(report.rhymes.find(pair => pair.lineIds[0] === 'line-3' && pair.lineIds[1] === 'line-4')).toMatchObject({ kind: 'unknown', confidence: 0.25 });
    expect(report.rhymes.filter(pair => pair.lineIds.includes('line-5')).every(pair => pair.kind === 'unknown' && pair.confidence === 0)).toBe(true);
  });

  it('returns repetition measurements without a creative acceptance policy', () => {
    const report = textAnalyzer.analyze(lines('Morning morning', 'Morning compass compass'), catalog.pronunciations);
    expect(report.repeatedTerms).toEqual({ compass: 2, morning: 3 });
    expect('warnings' in report).toBe(false);
    expect('admissible' in report).toBe(false);
  });

  it('is deterministic with frozen inputs and does not mutate pronunciation data', () => {
    const input = freeze(lines('Quiet people', 'I follow the light'));
    const before = JSON.stringify(catalog.pronunciations.all());
    expect(textAnalyzer.analyze(input, catalog.pronunciations)).toEqual(textAnalyzer.analyze(input, catalog.pronunciations));
    expect(JSON.stringify(catalog.pronunciations.all())).toBe(before);
  });

  it('rejects duplicate line identities and invalid pronunciation counts', () => {
    const input = lines('one', 'two'); const duplicate = [input[0], { ...input[1], lineId: input[0].lineId }];
    expect(() => textAnalyzer.analyze(duplicate, catalog.pronunciations)).toThrow('unique line IDs');
    expect(() => textAnalyzer.analyze(lines('quiet'), immutableView([pronunciation('quiet', -2)]))).toThrow('Invalid pronunciation');
  });
});
