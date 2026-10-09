import { describe, expect, it } from 'vitest';
import { genres, genreAdditions, palette, legacyMoods, moods, instruments, productions, textures, deliveries, themes, cadenceRanges } from '../data';
import { catalog, expandedCatalog, legacyGenreView, createCatalog, immutableView } from './catalogs';
import type { FoundationCatalog } from './catalogs';

const codepointSort = (ids: readonly string[]) => [...ids].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
function assertDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(assertDeepFrozen);
  }
}
const viewNames = ['genres', 'traits', 'vocabulary', 'templates', 'pronunciations', 'dialects', 'choices'] as const;

function snapshotContents(snapshot: FoundationCatalog) {
  return { packs: snapshot.packs, ...Object.fromEntries(viewNames.map(name => [name, snapshot[name].all()])) };
}

describe('immutable indexed catalogue views', () => {
  it('uses codepoint ID ordering rather than insertion order or host locale', () => {
    const source = ['ä', 'z', 'a', 'A', '10'].map(id => ({ id, label: id }));
    const view = immutableView(source);
    expect(view.all().map(entry => entry.id)).toEqual(['10', 'A', 'a', 'z', 'ä']);
    expect(source.map(entry => entry.id)).toEqual(['ä', 'z', 'a', 'A', '10']);
    expect(view.get('ä')).toEqual({ id: 'ä', label: 'ä' });
    expect(view.get('missing')).toBeUndefined();
  });

  it('deeply freezes a defensive copy without freezing the source', () => {
    const source = [{ id: 'entry', nested: { label: 'original', ids: ['a'] } }];
    const view = immutableView(source);
    const retained = view.get('entry')!;
    expect(retained).not.toBe(source[0]);
    expect(retained.nested).not.toBe(source[0].nested);
    expect(Object.isFrozen(source[0])).toBe(false);
    source[0].nested.label = 'changed';
    source[0].nested.ids.push('b');
    source.push({ id: 'later', nested: { label: 'later', ids: [] } });
    expect(view.all()).toEqual([{ id: 'entry', nested: { label: 'original', ids: ['a'] } }]);
    expect(view.get('later')).toBeUndefined();
    assertDeepFrozen(view);
    assertDeepFrozen(view.all());
    expect(() => { retained.nested.label = 'illegal'; }).toThrow();
    expect(() => { (view.all() as typeof source).push(source[0]); }).toThrow();
  });

  it('preserves explicit IDs when labels collide or change', () => {
    const first = immutableView([{ id: 'trait-a', label: 'Warm' }, { id: 'trait-b', label: 'Warm' }]);
    const renamed = immutableView([{ id: 'trait-a', label: 'Tender' }, { id: 'trait-b', label: 'Warm' }]);
    expect(first.all().map(entry => entry.id)).toEqual(renamed.all().map(entry => entry.id));
    expect(renamed.get('trait-a')?.label).toBe('Tender');
  });

  it('accepts an empty pack view and reports absent references through undefined', () => {
    const view = immutableView<{ id: string }>([]);
    expect(view.all()).toEqual([]);
    expect(view.get('absent')).toBeUndefined();
  });

  it('rejects duplicate IDs even when their labels differ', () => {
    expect(() => immutableView([{ id: 'same', label: 'First' }, { id: 'same', label: 'Second' }])).toThrow();
  });

  it.each(['', '   '])('rejects an empty or whitespace ID %j', id => {
    expect(() => immutableView([{ id }])).toThrow();
  });
});

describe('existing-pack catalogue snapshot', () => {
  it('pins the existing pack identity, version and content fingerprint', () => {
    expect(catalog.packs).toEqual([{
      id: 'legacy-v0.1', version: '1.0.0', contentHash: 'fnv1a-v1-7e737857',
    }]);
  });

  it('reconstructs the same content, IDs, pack versions and hashes', () => {
    expect(snapshotContents(createCatalog())).toEqual(snapshotContents(createCatalog()));
    expect(snapshotContents(catalog)).toEqual(snapshotContents(createCatalog()));
    expect(catalog.packs.length).toBeGreaterThan(0);
    expect(new Set(catalog.packs.map(pack => pack.id)).size).toBe(catalog.packs.length);
    catalog.packs.forEach(pack => {
      expect(pack.id.length).toBeGreaterThan(0);
      expect(pack.version.length).toBeGreaterThan(0);
      expect(pack.contentHash).toMatch(/^fnv1a-v1-[0-9a-f]{8}$/);
    });
  });

  it('freezes every view, entry, nested collection and pack reference', () => {
    assertDeepFrozen(catalog);
    viewNames.forEach(name => assertDeepFrozen(catalog[name].all()));
  });

  it('returns stable, unique ordered IDs and indexed entry identities in every view', () => {
    for (const name of viewNames) {
      const view = catalog[name];
      const entries = view.all();
      const ids = entries.map(entry => entry.id);
      expect(ids).toEqual(codepointSort(ids));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every(id => id.length > 0)).toBe(true);
      entries.forEach(entry => expect(view.get(entry.id)).toBe(entry));
      expect(view.get('fixture:unavailable-reference')).toBeUndefined();
    }
  });

  it('preserves all existing genre labels, tempo ranges and sound descriptors', () => {
    expect(catalog.genres.all()).toHaveLength(legacyGenreView.all().length);
    for (const source of legacyGenreView.all()) {
      const genre = catalog.genres.get(source.id)!;
      expect(genre.label).toBe(source.name);
      expect(genre.bpmRange).toEqual(source.bpm);
      expect(genre.traitIds.map(id => catalog.traits.get(id)?.label)).toEqual(source.descriptors);
    }
  });

  it('adds a broad style catalog while keeping moods independent', () => {
    const expectedIds = [
      'rap', 'trap', 'drill', 'grime', 'phonk', 'boom-bap', 'lo-fi-hip-hop', 'cloud-rap',
      'pop', 'dance-pop', 'synth-pop', 'k-pop', 'hard-rock', 'punk-rock', 'pop-punk', 'heavy-metal',
      'edm', 'techno', 'house', 'trance', 'drum-and-bass', 'dubstep', 'chillout', 'chillhop',
    ];
    expect(genres).toHaveLength(34);
    expect(genres.slice(10).map(genre => genre.id)).toEqual(expectedIds);
    expect(moods).toContain('Chill');
    expect(expandedCatalog.genres.all()).toHaveLength(34);
    expect(new Set(expandedCatalog.genres.all().map(genre => genre.familyId))).toEqual(new Set([
      'family:folk', 'family:pop', 'family:rnb', 'family:hip-hop',
      'family:rock', 'family:electronic', 'family:soul', 'family:country',
    ]));
    expect(expandedCatalog.choices.get('mood:chill')).toEqual({ id: 'mood:chill', label: 'Chill', category: 'mood' });
    expect(expandedCatalog.genres.get('trap')?.familyId).toBe('family:hip-hop');
    expect(expandedCatalog.genres.get('techno')?.familyId).toBe('family:electronic');
    expect(expandedCatalog.genres.get('hard-rock')?.familyId).toBe('family:rock');
    for (const source of genreAdditions) {
      const genre = expandedCatalog.genres.get(source.id)!;
      expect(genre.label).toBe(source.name);
      expect(genre.bpmRange).toEqual(source.bpm);
      expect(genre.traitIds.map(id => expandedCatalog.traits.get(id)?.label)).toEqual(source.descriptors);
    }
  });

  it('keeps the legacy pack pinned and adds a separately fingerprinted style pack', () => {
    expect(catalog.packs).toEqual([{ id: 'legacy-v0.1', version: '1.0.0', contentHash: 'fnv1a-v1-7e737857' }]);
    expect(expandedCatalog.packs.map(pack => pack.id)).toEqual(['legacy-v0.1', 'genre-style-expansion-v1']);
    expect(expandedCatalog.packs[1].version).toBe('1.0.0');
    expect(expandedCatalog.packs[1].contentHash).toBe('fnv1a-v1-ef385413');
  });

  it('uses explicit stable family IDs rather than display labels', () => {
    expect(Object.fromEntries(catalog.genres.all().map(genre => [genre.id, genre.familyId]))).toEqual({
      'indie-folk': 'family:folk', 'dream-pop': 'family:pop', 'alt-pop': 'family:pop',
      rnb: 'family:rnb', 'hip-hop': 'family:hip-hop', 'indie-rock': 'family:rock',
      ambient: 'family:electronic', electronic: 'family:electronic', soul: 'family:soul', country: 'family:country',
    });
  });

  it('includes the existing semantic vocabulary without adding words or changing their kinds', () => {
    const source = Object.values(palette).flatMap(bank => [
      ...bank.objects.map(text => ({ text, kind: 'object' })),
      ...bank.places.map(text => ({ text, kind: 'location' })),
      ...bank.states.map(text => ({ text, kind: 'state' })),
    ]);
    const values = catalog.vocabulary.all().map(({ text, kind }) => ({ text, kind }));
    const ordered = (entries: typeof source) => [...entries].sort((a, b) => `${a.kind}:${a.text}` < `${b.kind}:${b.text}` ? -1 : `${a.kind}:${a.text}` > `${b.kind}:${b.text}` ? 1 : 0);
    expect(ordered(values)).toEqual(ordered(source));
  });

  it('preserves existing choice labels and delivery targets by explicit category', () => {
    const groups = { mood: legacyMoods, instrument: instruments, production: productions, texture: textures, delivery: deliveries, theme: themes };
    for (const [category, labels] of Object.entries(groups)) {
      expect(catalog.choices.all().filter(choice => choice.category === category).map(choice => choice.label).sort()).toEqual([...labels].sort());
    }
    for (const choice of catalog.choices.all().filter(choice => choice.category === 'delivery')) expect(choice.range).toEqual(cadenceRanges[choice.label]);
  });

  it('resolves declared conflict, vocabulary and optional pronunciation references', () => {
    for (const trait of catalog.traits.all()) {
      for (const id of trait.excludes) expect(catalog.traits.get(id)).toBeDefined();
    }
    for (const entry of catalog.vocabulary.all()) {
      for (const id of [...entry.themeIds, ...entry.toneIds]) expect(catalog.choices.get(id)).toBeDefined();
      if (entry.pronunciationId) expect(catalog.pronunciations.get(entry.pronunciationId)).toBeDefined();
    }
  });

  it('preserves the existing pronunciation overrides without inventing phonemes', () => {
    const expected = { fire: 1, hour: 1, our: 1, every: 2, different: 3, quiet: 2, familiar: 3, towards: 1, poem: 2, poetry: 3, rhythm: 2, little: 2, people: 2, something: 2, evening: 2, memories: 3, promises: 3 };
    expect(Object.fromEntries(catalog.pronunciations.all().map(entry => [entry.token, entry.syllables]))).toEqual(expected);
    for (const entry of catalog.pronunciations.all()) { expect(entry.locale).toBe('en'); expect(entry.phonemes).toEqual([]); }
  });

  it('preserves existing dialect vocabulary and optional going-to substitution', () => {
    expect(catalog.dialects.all()).toHaveLength(3);
    expect(catalog.dialects.get('dialect:standard')?.rules).toEqual([]);
    const vocabulary = (id: string) => Object.fromEntries(catalog.dialects.get(id)!.rules.filter(rule => rule.kind === 'vocabulary').map(rule => [rule.source, rule.replacement]));
    expect(vocabulary('dialect:british')).toEqual({ apartment: 'flat', sidewalk: 'pavement', elevator: 'lift', downtown: 'the town centre' });
    expect(vocabulary('dialect:american')).toEqual({ flat: 'apartment', pavement: 'sidewalk', lift: 'elevator' });
    for (const dialect of catalog.dialects.all().filter(pack => pack.id !== 'dialect:standard')) {
      expect(dialect.rules.filter(rule => rule.kind === 'grammar').map(({ source, replacement, minimumStrength }) => ({ source, replacement, minimumStrength }))).toEqual([{ source: 'going to', replacement: 'gonna', minimumStrength: 4 }]);
      expect(dialect.rules.filter(rule => rule.kind === 'vocabulary').every(rule => rule.minimumStrength === 2)).toBe(true);
    }
  });

  it('retains all existing verse-bank phrases in declarative templates', () => {
    expect(catalog.templates.all()).toHaveLength(56);
    const patterns = catalog.templates.all().map(template => template.pattern);
    for (const bank of Object.values(palette)) {
      for (const line of bank.lines) expect(patterns).toContain(line);
    }
  });
});
