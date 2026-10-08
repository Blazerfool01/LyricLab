import { exceptions, rhymeSets } from '../legacy-pack';
import { fingerprint } from './randomness';
import type { CatalogView, ContextLine, PronunciationEntry, RhymeRelation, TextAnalysis, TextAnalyzer } from './contracts';

const tokens = (text: string) => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
function estimatedWord(word: string): number {
  if (word.length <= 3) return 1;
  const clean = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (clean.match(/[aeiouy]{1,2}/g) || []).length);
}
/** Legacy helpers deliberately retain v0.1 tokenization, estimates and keys. */
export function syllables(text: string): number {
  return tokens(text).reduce((sum, word) => sum + (exceptions[word] || estimatedWord(word)), 0);
}
export function rhymeKey(text: string): string {
  const word = text.toLowerCase().match(/[a-z]+/g)?.at(-1) || '';
  const group = rhymeSets.findIndex(words => words.includes(word));
  return group >= 0 ? `known-${group}` : word.match(/[aeiouy][^aeiouy]*$/)?.[0] || word;
}
export function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}
function phoneticTail(entry: PronunciationEntry | undefined): string | undefined {
  if (!entry?.phonemes.length) return undefined;
  const vowel = /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)[012]?$/;
  const sounds = entry.phonemes.map(sound => sound.toUpperCase());
  let index = -1;
  sounds.forEach((sound, i) => { if (vowel.test(sound) && /[12]$/.test(sound)) index = i; });
  if (index < 0) sounds.forEach((sound, i) => { if (vowel.test(sound)) index = i; });
  return index < 0 ? undefined : sounds.slice(index).map(sound => sound.replace(/[012]$/, '')).join('-');
}

export const textAnalyzer: TextAnalyzer = {
  analyze(lines: readonly ContextLine[], pronunciations: CatalogView<PronunciationEntry>): TextAnalysis {
    const ids = new Set<string>();
    const dictionary = new Map<string, PronunciationEntry>();
    // Stable first-entry precedence permits pronunciation variants without host locale ordering.
    for (const entry of pronunciations.all()) {
      if (!Number.isInteger(entry.syllables) || entry.syllables < 1) throw new Error(`Invalid pronunciation: ${entry.id}`);
      const key = entry.token.toLowerCase();
      if (!dictionary.has(key)) dictionary.set(key, entry);
    }
    const endings: { word: string; key: string; phonetic?: string }[] = [];
    const frequencies = new Map<string, number>();
    const measurements = lines.map(line => {
      if (!line.lineId || ids.has(line.lineId) || typeof line.text !== 'string') throw new Error('Analysis requires unique line IDs and text');
      ids.add(line.lineId);
      const words = tokens(line.text);
      for (const word of words.filter(word => word.length > 4)) frequencies.set(word, (frequencies.get(word) || 0) + 1);
      const known = words.length > 0 && words.every(word => dictionary.has(word));
      const count = words.reduce((sum, word) => sum + (dictionary.get(word)?.syllables ?? estimatedWord(word)), 0);
      const word = words.at(-1) || '';
      const key = rhymeKey(line.text);
      const phonetic = phoneticTail(dictionary.get(word));
      endings.push({ word, key, phonetic });
      return { lineId: line.lineId, textFingerprint: fingerprint(line.text), syllables: count, confidence: words.length ? known ? 'known' as const : 'estimated' as const : 'unknown' as const, ...(word ? { endRhymeKey: phonetic ? `phonetic:${phonetic}` : key } : {}) };
    });
    const rhymes: RhymeRelation[] = [];
    for (let i = 0; i < endings.length; i++) for (let j = i + 1; j < endings.length; j++) {
      const a = endings[i], b = endings[j];
      let kind: RhymeRelation['kind'] = 'unknown', confidence = 0;
      if (a.word && b.word) {
        if (a.phonetic && b.phonetic) {
          if (a.phonetic === b.phonetic) { kind = 'exact'; confidence = 1; }
          else if (a.phonetic.split('-')[0] === b.phonetic.split('-')[0]) { kind = 'slant'; confidence = 0.7; }
        } else if (a.word === b.word) { kind = 'exact'; confidence = 0.9; }
        else if (a.key === b.key && a.key.startsWith('known-')) {
          // These legacy groups contain mixed vowel/coda patterns; do not call them perfect.
          kind = ['known-2', 'known-14'].includes(a.key) ? 'slant' : 'exact'; confidence = kind === 'slant' ? 0.6 : 0.8;
        } else if (a.key === b.key) confidence = 0.25;
      }
      rhymes.push({ lineIds: [lines[i].lineId, lines[j].lineId], kind, confidence });
    }
    const repeatedTerms = Object.fromEntries([...frequencies].filter(([, count]) => count > 1).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    return { lines: measurements, rhymes, repeatedTerms };
  },
};
