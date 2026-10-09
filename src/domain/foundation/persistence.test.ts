import { describe, expect, it } from 'vitest';
import legacyFixture from '../fixtures/legacy-v0.1.json';
import eFixture from './generation-fixture.json';
import fFixture from './narrative-fixture.json';
import type { Project } from '../types';
import type { GenerationRequest, LyricCandidate, ProjectEnvelope, ReplayRecipe, Resolution, SongBlueprint } from './contracts';
import { decodeProject, MAX_PROJECT_BYTES, MAX_PROJECT_SECTIONS, projectSongSpec, replayRecipe, serializeProject, toEditorProject, toEnvelope } from './persistence';
import { fromLegacyProject } from './adapters';
import { catalog, freeze, generationCatalog } from './catalogs';
import { createDefaultProfile, makeRecipe } from './generation';
import { foundationCoordinator, legacyNarrativeCatalog, narrativeCatalog } from './narrative-generation';
import { documentApplicator, withRevision } from './editing';
import { fingerprint } from './randomness';

const legacy = legacyFixture.input.project as unknown as Project;
const expectResolved = <T>(resolution: Resolution<T>): T => { expect(resolution.status).toBe('resolved'); if (resolution.status !== 'resolved') throw new Error(JSON.stringify(resolution)); return resolution.value; };
function envelope(): ProjectEnvelope {
  const { blueprint, document } = fromLegacyProject(structuredClone(legacy));
  return { schemaVersion: 2, app: 'LyricLab', id: blueprint.id, blueprint, document, recipes: [], variations: { [blueprint.sections[0].generationKey]: 3, 'hook-preview:refrain': 7 }, updatedAt: '2026-10-08T00:00:00.000Z', ignoredWarnings: ['warning-1'] };
}
function historical(which: 'E' | 'F' = 'F') {
  const fixture = which === 'F' ? fFixture : eFixture;
  const request = structuredClone(fixture.request) as unknown as GenerationRequest;
  const candidate = fixture.expected.candidates[0].candidate as unknown as LyricCandidate;
  const recipe = makeRecipe(request, candidate, which === 'F' ? narrativeCatalog : generationCatalog);
  const applied = documentApplicator.apply(request.document, { kind: 'candidate', expectedRevision: request.document.revision, replacementPolicy: request.replacementPolicy, sectionId: request.sectionId, candidate, recipe });
  expect(applied.status).toBe('applied'); if (applied.status !== 'applied') throw new Error('Invalid fixed historical fixture');
  const project: ProjectEnvelope = { schemaVersion: 2, app: 'LyricLab', id: request.blueprint.id, blueprint: request.blueprint, document: applied.document, recipes: [recipe], variations: { [recipe.generationKey]: request.variation + 1 }, ignoredWarnings: [], updatedAt: '2026-10-08T00:00:00.000Z' };
  return { project, request, candidate, recipe };
}

describe('canonical project envelope v2', () => {
  it('serializes only one blueprint/document authority with durable variation counters', () => {
    const source = envelope(), text = serializeProject(source);
    expect(expectResolved(decodeProject(text))).toEqual(source);
    const json = JSON.parse(text);
    expect(json.schemaVersion).toBe(2);
    expect(json).not.toHaveProperty('structure'); expect(json).not.toHaveProperty('engineState');
    expect(json.variations).toEqual(source.variations);
    expect(serializeProject(expectResolved(decodeProject(text)))).toBe(text);
  });

  it('does not mutate frozen decoded/serialized input', () => {
    const source = freeze(envelope()), before = JSON.stringify(source);
    expectResolved(decodeProject(source)); serializeProject(source); projectSongSpec(source);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('rejects unsupported schemas, nonprojects, corrupt JSON and required invalid core values', () => {
    const source = envelope();
    for (const value of ['{', null, { ...source, schemaVersion: 3 }, { ...source, app: 'Elsewhere' }, { ...source, blueprint: { ...source.blueprint, rootSeed: -1 } }, { ...source, blueprint: { ...source.blueprint, style: null } }, { ...source, document: { sections: [] } }]) expect(decodeProject(value).status).toBe('invalid-input');
    expect(decodeProject(projectSongSpec(source)).status).toBe('invalid-input');
  });

  it('preserves long valid text and rejects declared size/count limits without truncation', () => {
    const source = envelope();
    const long = 'A'.repeat(20000);
    const document = withRevision(source.document.sections.map((section, i) => i ? section : { ...section, lines: section.lines.map((line, j) => j ? line : { ...line, text: long }) }));
    expect(expectResolved(decodeProject({ ...source, document })).document.sections[0].lines[0].text).toBe(long);
    expect(decodeProject({ ...source, blueprint: { ...source.blueprint, title: 'X'.repeat(MAX_PROJECT_BYTES) } }).status).toBe('invalid-input');
    expect(decodeProject({ ...source, blueprint: { ...source.blueprint, sections: Array.from({ length: MAX_PROJECT_SECTIONS + 1 }, () => source.blueprint.sections[0]) } }).status).toBe('invalid-input');
  });

  it('repairs optional metadata while preserving every accepted lyric', () => {
    const source = envelope(), originalTexts = source.document.sections.flatMap(s => s.lines.map(l => l.text));
    const broken = { ...source, updatedAt: 'bad date', ignoredWarnings: ['valid', 4], variations: { valid: 9, invalid: -1 }, blueprint: { ...source.blueprint, style: { ...source.blueprint.style, bpm: 'bad', voice: { ...source.blueprint.style.voice, textureIds: ['texture:airy', null] } }, sections: source.blueprint.sections.map(section => ({ ...section, constraints: { ...section.constraints, syllableRange: [12, 4], rhymeScheme: 'not letters' }, hookArchetype: 'invented' })) } };
    const result = decodeProject(broken), repaired = expectResolved(result);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(repaired.updatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(repaired.ignoredWarnings).toEqual(['valid']); expect(repaired.variations).toEqual({ valid: 9 });
    expect(repaired.blueprint.style).not.toHaveProperty('bpm');
    expect(repaired.blueprint.style.voice.textureIds).toEqual(['texture:airy']);
    expect(repaired.blueprint.sections[0].constraints).not.toHaveProperty('syllableRange');
    expect(repaired.document.sections.flatMap(s => s.lines.map(l => l.text))).toEqual(originalTexts);
  });

  it('clears stale semantic evidence and conservatively locks unsafe imported ranges', () => {
    const { project } = historical();
    const firstSection = project.document.sections.find(s => s.lines.some(l => l.annotations.length))!;
    const firstLine = firstSection.lines.find(l => l.annotations.length)!;
    const document = withRevision(project.document.sections.map(section => section !== firstSection ? section : { ...section, lines: section.lines.map(line => line !== firstLine ? line : { ...line, text: `${line.text} edited`, lockedRanges: [[0, 99999]] }) }));
    const result = decodeProject({ ...project, document }), repaired = expectResolved(result);
    const line = repaired.document.sections.flatMap(s => s.lines).find(l => l.id === firstLine.id)!;
    expect(line.text).toBe(`${firstLine.text} edited`); expect(line.locked).toBe(true); expect(line.lockedRanges).toEqual([]); expect(line.annotations).toEqual([]);
    expect(line.recipeId).toBe(firstLine.recipeId); expect(repaired.recipes).toEqual(project.recipes);
    expect(result.diagnostics.some(issue => issue.message.includes('evidence'))).toBe(true);
  });

  it('repairs duplicate section/line/key IDs deterministically and remaps accepted sections', () => {
    const source = envelope();
    const blueprint = { ...source.blueprint, sections: source.blueprint.sections.map(section => ({ ...section, id: 'duplicate', generationKey: 'duplicate-key' })) };
    const document = withRevision(source.document.sections.map(section => ({ ...section, sectionId: 'duplicate', lines: section.lines.map(line => ({ ...line, id: 'duplicate-line' })) })));
    const input = { ...source, blueprint, document, variations: { 'duplicate-key': 11 } }, first = expectResolved(decodeProject(input)), second = expectResolved(decodeProject(input));
    expect(first).toEqual(second);
    expect(new Set(first.blueprint.sections.map(s => s.id)).size).toBe(first.blueprint.sections.length);
    expect(new Set(first.blueprint.sections.map(s => s.generationKey)).size).toBe(first.blueprint.sections.length);
    expect(new Set(first.document.sections.flatMap(s => s.lines.map(l => l.id))).size).toBe(first.document.sections.flatMap(s => s.lines).length);
    expect(first.document.sections.map(s => s.sectionId)).toEqual(first.blueprint.sections.map(s => s.id));
    expect(first.blueprint.sections.every(s => first.variations[s.generationKey] === 11)).toBe(true);
    expect(first.document.sections.flatMap(s => s.lines.map(l => l.text))).toEqual(source.document.sections.flatMap(s => s.lines.map(l => l.text)));
  });
});

describe('deterministic schema v1 migration', () => {
  it('migrates the literal legacy fixture preserving names, accepted text and locks without invented history', () => {
    const before = structuredClone(legacy), result = decodeProject(freeze(structuredClone(legacy))), migrated = expectResolved(result);
    expect(legacy).toEqual(before);
    expect(migrated.blueprint.sections.map(s => s.name)).toEqual(legacy.structure.map(s => s.name));
    expect(migrated.document.sections.flatMap(s => s.lines.map(l => l.text))).toEqual(legacy.structure.flatMap(s => s.lines.map(l => l.text)));
    expect(migrated.document.sections.map(s => s.locked)).toEqual(legacy.structure.map(s => s.locked));
    expect(migrated.document.sections.flatMap(s => s.lines.map(l => l.locked))).toEqual(legacy.structure.flatMap(s => s.lines.map(l => l.locked)));
    expect(migrated.recipes).toEqual([]); expect(migrated.variations).toEqual({});
    expect(migrated.document.sections.flatMap(s => s.lines).every(l => l.origin === 'authored' || l.origin === 'unknown' || !l.text.trim())).toBe(true);
  });

  it('preserves unknown genre/choice labels and repairs legacy optional values with warnings', () => {
    const input = { ...structuredClone(legacy), seed: 'bad seed', style: { ...legacy.style, bpm: 'invalid', genres: [{ id: 'genre:uninstalled', weight: 'bad' }, { id: 'indie-folk', weight: 20 }], rhythm: 'Unfamiliar rhythm' }, language: { ...legacy.language, perspective: 'wrong', dialectStrength: 99 }, structure: legacy.structure.map(section => ({ ...section, type: 'bad type', intensity: -5, syllableRange: [12, 2], rhymeScheme: 'bad' })) };
    const result = decodeProject(input), migrated = expectResolved(result);
    expect(migrated.blueprint.rootSeed).toBe(2408);
    expect(migrated.blueprint.style.genres).toEqual([{ id: 'genre:uninstalled', weight: 1 }, { id: 'indie-folk', weight: 20 }]);
    expect(migrated.blueprint.style.rhythmId).toBe('unavailable:rhythm:Unfamiliar rhythm');
    expect(migrated.document.sections.flatMap(s => s.lines.map(l => l.text))).toEqual(legacy.structure.flatMap(s => s.lines.map(l => l.text)));
    expect(result.diagnostics.filter(issue => issue.severity === 'warning').length).toBeGreaterThan(8);
  });

  it('repairs missing IDs and timestamps without ambient UUIDs or time', () => {
    const source = structuredClone(legacy) as unknown as Record<string, unknown>;
    delete source.id; delete source.updatedAt;
    source.structure = legacy.structure.map(section => ({ ...section, id: '', lines: section.lines.map(line => ({ ...line, id: '' })) }));
    const first = expectResolved(decodeProject(source)), second = expectResolved(decodeProject(source));
    expect(first).toEqual(second); expect(first.updatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(first.id.startsWith('repair:project:fnv1a-v1-')).toBe(true);
    expect(new Set(first.document.sections.flatMap(s => s.lines.map(l => l.id))).size).toBe(first.document.sections.flatMap(s => s.lines).length);
    expect(expectResolved(decodeProject({ ...source, title: 'Different project' })).id).not.toBe(first.id);
  });
});

describe('ephemeral editor projection preserves canonical authoring intent', () => {
  function rich(): ProjectEnvelope {
    const source = envelope();
    const blueprint: SongBlueprint = { ...source.blueprint, style: { ...source.blueprint.style, genres: [{ id: 'opaque-genre-id', weight: 0.17 }, ...source.blueprint.style.genres], traitIds: ['opaque-trait-id', ...source.blueprint.style.traitIds] }, language: { ...source.blueprint.language, themeIds: [{ id: 'opaque-theme-id', weight: 8 }, ...source.blueprint.language.themeIds, { id: 'theme:ambition', weight: 0.08 }], toneIds: ['opaque-tone-id'], preferredTerms: ['a term, with a comma', 'quiet room'], dialect: { packId: 'opaque-dialect-id', strength: 3, mode: 'metadata' } }, narrative: { narratorId: 'custom-narrator', subjectIds: ['custom-subject'], goals: [{ id: 'goal:a', status: 'challenged', description: 'Make a choice' }] }, sections: source.blueprint.sections.map(section => ({ ...section, hookArchetype: 'contrast', constraints: { ...section.constraints, repetitionPreference: 'high' } })) };
    return { ...source, blueprint };
  }

  it('round-trips arbitrary weighted references and every field absent from the legacy UI', () => {
    const source = rich(), project = toEditorProject(source);
    expect(project.engineState?.originalBlueprint).toEqual(source.blueprint);
    expect(toEnvelope(project)).toEqual(source);
    expect(JSON.parse(serializeProject(toEnvelope(project)))).not.toHaveProperty('engineState');
  });

  it('changes represented fields explicitly while retaining unrelated unknown references, goals and modes', () => {
    const source = rich(), project = toEditorProject(source);
    project.title = 'An edited title'; project.style.bpm = 127; project.style.production = ['Organic']; project.language.motif = 'new motif';
    const changed = toEnvelope(project);
    expect(changed.blueprint.title).toBe('An edited title'); expect(changed.blueprint.style.bpm).toBe(127); expect(changed.blueprint.language.motif).toBe('new motif');
    expect(changed.blueprint.language.themeIds).toEqual(source.blueprint.language.themeIds); expect(changed.blueprint.language.toneIds).toEqual(source.blueprint.language.toneIds);
    expect(changed.blueprint.style.traitIds).toContain('opaque-trait-id'); expect(changed.blueprint.narrative).toEqual(source.blueprint.narrative);
    expect(changed.blueprint.language.dialect).toEqual(source.blueprint.language.dialect); expect(changed.blueprint.sections[0].hookArchetype).toBe('contrast');
  });

  it('retains unrepresented theme weights and additional themes after a primary theme edit', () => {
    const source = rich(), editor = toEditorProject(source);
    editor.language.theme = 'Love & connection';
    const changed = toEnvelope(editor);
    expect(changed.blueprint.language.themeIds[0].id).toBe('theme:love');
    expect(changed.blueprint.language.themeIds.slice(1)).toEqual(source.blueprint.language.themeIds.slice(1));
  });

  it('adapts dialect mode after explicit strength changes and preserves the opaque pack reference', () => {
    const source = rich(), editor = toEditorProject(source);
    editor.language.dialectStrength = 5;
    expect(toEnvelope(editor).blueprint.language.dialect).toEqual({ packId: 'opaque-dialect-id', strength: 5, mode: 'phonetic' });
  });

  it('preserves persistent generation identities, roles and custom section names after reorder', () => {
    const source = rich(), project = toEditorProject(source);
    project.structure.reverse(); project.structure[0].name = 'Custom closer';
    const changed = toEnvelope(project);
    for (const section of changed.blueprint.sections) { const prior = source.blueprint.sections.find(s => s.id === section.id)!; expect(section.generationKey).toBe(prior.generationKey); expect(section.role).toBe(prior.role); }
    expect(changed.blueprint.sections[0].name).toBe('Custom closer');
    expect(changed.variations).toEqual(source.variations);
  });

  it('preserves absent optional blueprint controls through editor defaults', () => {
    const source = envelope(), blueprint = structuredClone(source.blueprint) as SongBlueprint;
    const style = { ...blueprint.style }; delete (style as { bpm?: number }).bpm; delete (style as { rhythmId?: string }).rhythmId;
    const language = { ...blueprint.language }; delete (language as { dialect?: unknown }).dialect;
    const sections = blueprint.sections.map(section => { const value = { ...section, constraints: {} }; delete value.name; return value; });
    const absent = { ...source, blueprint: { ...blueprint, style, language, sections } };
    expect(toEnvelope(toEditorProject(absent))).toEqual(absent);
  });

  it('handles arbitrary stable identities even when they match JavaScript prototype names', () => {
    const source = envelope(), oldId = source.blueprint.sections[0].id;
    const named = { ...source, blueprint: { ...source.blueprint, sections: source.blueprint.sections.map(section => section.id !== oldId ? section : { ...section, id: 'constructor', generationKey: '__proto__' }) }, document: withRevision(source.document.sections.map(section => section.sectionId !== oldId ? section : { ...section, sectionId: 'constructor', lines: section.lines.map((line, i) => i ? line : { ...line, id: 'toString' }) })) };
    expect(toEnvelope(toEditorProject(named))).toEqual(named);
  });

  it('manual edits clear stale evidence/ranges, preserve historical lineage and promote unsafe spans to a visible line lock', () => {
    const { project } = historical(), original = project.document.sections.flatMap(s => s.lines)[0];
    const withRange = { ...project, document: withRevision(project.document.sections.map(section => ({ ...section, lines: section.lines.map(line => line.id === original.id ? { ...line, lockedRanges: [[0, 2] as const] } : line) }))) };
    const editor = toEditorProject(withRange), edited = editor.structure.flatMap(s => s.lines).find(l => l.id === original.id)!;
    edited.text = 'A newly authored line'; edited.authored = true;
    const changed = toEnvelope(editor), accepted = changed.document.sections.flatMap(s => s.lines).find(l => l.id === original.id)!;
    expect(accepted.origin).toBe('authored'); expect(accepted.locked).toBe(true); expect(accepted.lockedRanges).toEqual([]); expect(accepted.annotations).toEqual([]);
    expect(accepted.recipeId).toBe(original.recipeId); expect(changed.recipes).toEqual(project.recipes);
  });
});

describe('descriptive SongSpec v1', () => {
  it('includes weighted labels, voice/dialect guidance, semantic purpose, narrative intent and accepted lyrics', () => {
    const source = envelope(), spec = projectSongSpec(source);
    expect(spec.format).toBe('SongSpec'); expect(spec.schemaVersion).toBe(1);
    expect(spec.style.genres[0]).toEqual({ ...source.blueprint.style.genres[0], label: generationCatalog.genres.get(source.blueprint.style.genres[0].id)!.label });
    expect(spec.sections[0].lyrics).toEqual(source.document.sections[0].lines.map(line => line.text));
    expect(spec.sections[0].purpose).toBe(source.blueprint.sections[0].purpose); expect(spec.language.tones.length).toBe(source.blueprint.language.toneIds.length); expect(spec.narrative).toEqual(source.blueprint.narrative);
    for (const key of ['document', 'recipes', 'updatedAt', 'ignoredWarnings', 'variations', 'rootSeed', 'engineState']) expect(spec).not.toHaveProperty(key);
    for (const key of ['locked', 'generationKey', 'recipeId']) expect(spec.sections[0]).not.toHaveProperty(key);
  });

  it('retains unavailable stable IDs with honest fallback labels rather than dropping them', () => {
    const source = envelope(), unknown = { ...source, blueprint: { ...source.blueprint, style: { ...source.blueprint.style, genres: [{ id: 'absent-genre', weight: 7 }] }, language: { ...source.blueprint.language, toneIds: ['absent-tone'], dialect: { packId: 'absent-dialect', strength: 4 as const, mode: 'vocabulary' as const } } } };
    const spec = projectSongSpec(unknown);
    expect(spec.style.genres).toEqual([{ id: 'absent-genre', label: 'Unavailable (absent-genre)', weight: 7 }]);
    expect(spec.language.dialect).toEqual({ pack: { id: 'absent-dialect', label: 'Unavailable (absent-dialect)' }, strength: 4, mode: 'vocabulary', styleTags: [] });
  });
});

describe('exact recipe replay from original history', () => {
  it.each(['E', 'F'] as const)('replays the literal %s candidate fixture after serialization', which => {
    const { project, recipe, candidate } = historical(which), loaded = expectResolved(decodeProject(serializeProject(project)));
    expect(expectResolved(replayRecipe(loaded.recipes[0]))).toEqual(candidate);
    expect(loaded.recipes[0]).toEqual(recipe);
  });

  it('replays supported base-only profiles without upgrading their historical packs', () => {
    const request = { ...(eFixture.request as unknown as GenerationRequest), profile: createDefaultProfile(catalog) };
    const result = foundationCoordinator.generate(request, catalog); expect(result.status).toBe('ready'); if (result.status !== 'ready') return;
    const candidate = result.candidates[0].candidate, recipe = makeRecipe(request, candidate, catalog);
    expect(expectResolved(replayRecipe(recipe))).toEqual(candidate);
  });

  it('keeps replay independent of later title/text/seed edits and does not mutate current documents', () => {
    const { project, candidate } = historical(), editor = toEditorProject(project);
    editor.title = 'A later title'; editor.seed = 19; editor.structure[0].lines[0].text = 'Current manual text'; editor.structure[0].lines[0].authored = true;
    const current = freeze(toEnvelope(editor)), before = JSON.stringify(current);
    expect(expectResolved(replayRecipe(current.recipes[0]))).toEqual(candidate);
    expect(JSON.stringify(current)).toBe(before);
    expect(current.document.sections[0].lines[0].text).toBe('Current manual text');
  });

  it('retains unavailable profiles and future contracts as inspectable history, refusing fallback', () => {
    const { project, recipe } = historical();
    const absent = { ...recipe, profile: { ...recipe.profile, packs: recipe.profile.packs.map((pack, i) => i ? pack : { ...pack, contentHash: 'unavailable-hash' }) } };
    const future = { ...recipe, id: 'future-recipe', profile: { ...recipe.profile, contractVersion: 2 } };
    const loaded = expectResolved(decodeProject({ ...project, recipes: [absent, future] }));
    expect(loaded.recipes).toEqual([absent, future]); expect(loaded.document).toEqual(project.document);
    expect(replayRecipe(loaded.recipes[0]).status).toBe('missing-dependency'); expect(replayRecipe(loaded.recipes[1]).status).toBe('missing-dependency');
  });

  it('rejects forged input/output fingerprints and invalid recorded attempt/scope without mutation', () => {
    const { recipe } = historical();
    const cases: ReplayRecipe[] = [{ ...recipe, inputFingerprint: 'forged' }, { ...recipe, outputFingerprint: 'forged' }, { ...recipe, candidateOrdinal: recipe.inputs.budget.maxAttempts }, { ...recipe, generationKey: 'forged-key' }];
    for (const broken of cases) { const before = JSON.stringify(broken); expect(replayRecipe(broken).status).toBe('invalid-input'); expect(JSON.stringify(broken)).toBe(before); }
    const altered = { ...recipe.inputs, blueprint: { ...recipe.inputs.blueprint, title: 'Tampered' } };
    expect(replayRecipe({ ...recipe, inputs: altered }).status).toBe('invalid-input');
  });

  it('ignores malformed optional recipes without destroying valid history or accepted lyrics', () => {
    const { project, recipe } = historical(), loaded = decodeProject({ ...project, recipes: [recipe, { id: 'broken' }] }), repaired = expectResolved(loaded);
    expect(repaired.recipes).toEqual([recipe]); expect(repaired.document).toEqual(project.document);
    expect(loaded.diagnostics.some(issue => issue.message.includes('historical recipe'))).toBe(true);
  });

  it('replays an admissible ordinal outside the displayed shortlist with active dialect and cleared annotations', () => {
    const source = structuredClone(fFixture.request) as unknown as GenerationRequest;
    const request: GenerationRequest = { ...source, blueprint: { ...source.blueprint, language: { ...source.blueprint.language, motif: 'apartment', dialect: { packId: 'dialect:british', strength: 3, mode: 'vocabulary' } }, sections: source.blueprint.sections.map(section => ({ ...section, constraints: { ...section.constraints, deliveryId: 'delivery:dense' } })) }, budget: { maxAttempts: 16, maxCandidates: 1 } };
    const full = foundationCoordinator.generate({ ...request, budget: { ...request.budget, maxCandidates: 16 } }, legacyNarrativeCatalog);
    const shortlist = foundationCoordinator.generate(request, legacyNarrativeCatalog);
    expect(full.status).toBe('ready'); expect(shortlist.status).toBe('ready');
    if (full.status !== 'ready' || shortlist.status !== 'ready') return;
    const candidate = full.candidates.find(entry => !shortlist.candidates.some(short => short.candidate.ordinal === entry.candidate.ordinal))!.candidate;
    expect(candidate.lines.every(line => line.text.includes('flat') && line.annotations.length === 0)).toBe(true);
    const recipe = makeRecipe(request, candidate, legacyNarrativeCatalog);
    expect(expectResolved(replayRecipe(recipe))).toEqual(candidate);
    expect(replayRecipe({ ...recipe, outputFingerprint: 'forged' }).status).toBe('invalid-input');
  });
});
