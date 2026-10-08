import { describe, expect, it } from 'vitest';
import legacyFixture from '../fixtures/legacy-v0.1.json';
import type { Project } from '../types';
import type { ProjectEnvelope } from './contracts';
import { emptyEngineState, fromLegacyProject } from './adapters';
import { freeze } from './catalogs';
import { withRevision } from './editing';
import { decodeProject, replayRecipe, serializeProject, toEditorProject, toEnvelope } from './persistence';
import { fingerprint } from './randomness';
import { acceptHook, analyzeStudioSection, applyStudioDialect, compileStudioStyle, duplicateStudioSection, previewHooks, previewStudioDialect, regenerateProject, setStudioRole } from './studio';
import type { StudioResult } from './studio';

const legacy = legacyFixture.input.project as unknown as Project;
const sectionId = legacy.structure[0].id;
function project(): Project {
  const state = { ...emptyEngineState(), lines: Object.fromEntries(legacy.structure.flatMap(section => section.lines.map(line => [line.id, { origin: line.authored ? 'authored' as const : 'generated' as const, textFingerprint: fingerprint(line.text), lockedRanges: [], annotations: [] }]))) };
  const adapted = fromLegacyProject(structuredClone(legacy), state);
  return toEditorProject({ schemaVersion: 2, app: 'LyricLab', id: legacy.id, ...adapted, variations: {}, recipes: [], ignoredWarnings: [], updatedAt: '2026-10-08T00:00:00.000Z' });
}
const applied = (result: StudioResult) => { expect(result.status).toBe('applied'); if (result.status !== 'applied') throw new Error(JSON.stringify(result)); return result.project; };
function alterDocument(source: Project, modify: (document: ProjectEnvelope['document']) => ProjectEnvelope['document']) {
  const envelope = toEnvelope(source);
  return toEditorProject({ ...envelope, document: modify(envelope.document) });
}

describe('studio regeneration uses durable intent and accepted history', () => {
  it('never changes root seed/style, advances only the chosen key and records exactly replayable accepted drafts', () => {
    const source = freeze(project()), original = toEnvelope(source), prompt = compileStudioStyle(source, 'Detailed');
    const first = applied(regenerateProject(source, sectionId)), envelope = toEnvelope(first), recipe = envelope.recipes[0];
    expect(envelope.blueprint.rootSeed).toBe(original.blueprint.rootSeed); expect(envelope.blueprint.style).toEqual(original.blueprint.style);
    expect(compileStudioStyle(first, 'Detailed')).toBe(prompt);
    expect(envelope.variations).toEqual({ [recipe.generationKey]: 1 }); expect(recipe.variation).toBe(0);
    const replayed = replayRecipe(recipe); expect(replayed.status).toBe('resolved'); if (replayed.status !== 'resolved') return;
    for (const line of replayed.value.lines) expect(envelope.document.sections.flatMap(section => section.lines).find(accepted => accepted.id === line.targetLineId)).toMatchObject({ text: line.text, annotations: line.annotations, recipeId: recipe.id });
    const loaded = decodeProject(serializeProject(envelope)); expect(loaded.status).toBe('resolved'); if (loaded.status !== 'resolved') return;
    const second = toEnvelope(applied(regenerateProject(toEditorProject(loaded.value), sectionId)));
    expect(second.variations[recipe.generationKey]).toBe(2); expect(second.recipes[0]).toEqual(recipe); expect(second.recipes[1].variation).toBe(1);
    expect(second.blueprint.style).toEqual(original.blueprint.style); expect(second.blueprint.rootSeed).toBe(original.blueprint.rootSeed);
    expect(JSON.stringify(source)).toBe(JSON.stringify(project()));
  });

  it('preserves recipes/counters and text from unrelated sections', () => {
    const source = duplicateStudioSection(project(), sectionId, 'unrelated-section', ['other-line-1', 'other-line-2', 'other-line-3', 'other-line-4']), chorus = 'unrelated-section';
    const first = toEnvelope(applied(regenerateProject(source, chorus)));
    const current = toEnvelope(applied(regenerateProject(toEditorProject(first), sectionId)));
    expect(current.recipes[0]).toEqual(first.recipes[0]);
    expect(current.document.sections.find(section => section.sectionId === chorus)).toEqual(first.document.sections.find(section => section.sectionId === chorus));
    expect(current.variations[first.blueprint.sections[1].generationKey]).toBe(first.variations[first.blueprint.sections[1].generationKey]);
  });

  it.each(['unknown', 'authored', 'line-lock', 'word-lock'] as const)('preserves %s text while generating other eligible lines', protection => {
    const source = alterDocument(project(), document => withRevision(document.sections.map((section, i) => i ? section : { ...section, lines: section.lines.map((line, j) => j !== 2 ? line : { ...line, origin: protection === 'unknown' ? 'unknown' : protection === 'authored' ? 'authored' : 'generated', locked: protection === 'line-lock', lockedRanges: protection === 'word-lock' ? [[0, 2]] : [] }) })));
    const before = toEnvelope(source), current = toEnvelope(applied(regenerateProject(source, sectionId)));
    expect(current.document.sections[0].lines.slice(0, 3)).toEqual(before.document.sections[0].lines.slice(0, 3));
    expect(current.recipes[0].inputs.targetLineIds).toEqual(before.document.sections[0].lines.map(line => line.id));
    expect(current.document.sections[0].lines[3].recipeId).toBe(current.recipes[0].id);
  });

  it('returns explicit exhaustion for section locks and unknown migrated lyrics without altering input', () => {
    const source = project(); source.structure[0].locked = true;
    const before = JSON.stringify(source); expect(regenerateProject(source, sectionId).status).toBe('exhausted'); expect(JSON.stringify(source)).toBe(before);
    const migrated = decodeProject(legacy); expect(migrated.status).toBe('resolved'); if (migrated.status !== 'resolved') return;
    expect(regenerateProject(toEditorProject(migrated.value), sectionId).status).toBe('exhausted');
  });

  it('uses independent role metadata rather than inferring it again after reorder', () => {
    const source = setStudioRole(project(), sectionId, 'challenge'); source.structure.reverse();
    expect(toEnvelope(source).blueprint.sections.find(section => section.id === sectionId)?.role).toBe('challenge');
    expect(regenerateProject(source, sectionId).status).toBe('applied');
  });

  it('supports arbitrary stable generation keys without inherited counter values', () => {
    const source = toEnvelope(project());
    const view = toEditorProject({ ...source, blueprint: { ...source.blueprint, sections: source.blueprint.sections.map((section, i) => i ? section : { ...section, generationKey: 'constructor' }) } });
    const current = toEnvelope(applied(regenerateProject(view, sectionId)));
    expect(current.variations.constructor).toBe(1);
  });
});

describe('studio hook previews have explicit acceptance boundaries', () => {
  it('previews three archetypes deterministically without writing, then accepts exact profile/seed/scope/history', () => {
    const source = freeze(project()), before = serializeProject(toEnvelope(source));
    const previews = previewHooks(source, 4);
    expect(previews.map(preview => preview.archetype)).toEqual(['title-drop', 'refrain', 'statement']);
    expect(previews.every(preview => !!preview.draft && preview.lines.length === 4)).toBe(true);
    expect(previewHooks(source, 4)).toEqual(previews); expect(serializeProject(toEnvelope(source))).toBe(before);
    const current = toEnvelope(applied(acceptHook(source, previews[1]))), intent = current.blueprint.sections.at(-1)!, recipe = current.recipes.at(-1)!;
    expect(intent.hookArchetype).toBe('refrain'); expect(intent.generationKey).toBe(recipe.generationKey); expect(recipe.variation).toBe(4); expect(recipe.rootSeed).toBe(current.blueprint.rootSeed);
    expect(recipe.inputs.sectionId).toBe(intent.id); expect(recipe.inputs.targetLineIds).toEqual(current.document.sections.at(-1)!.lines.map(line => line.id));
    expect(recipe.profile).toEqual(previews[1].draft!.request.profile);
    expect(current.document.sections.slice(0, -1)).toEqual(toEnvelope(source).document.sections);
    expect(current.variations['hook-lab']).toBe(5); expect(current.variations[intent.generationKey]).toBe(5);
    expect(replayRecipe(recipe).status).toBe('resolved');
  });

  it.each(['title', 'text', 'style', 'counter'] as const)('rejects a hook preview after a parent %s change, atomically', change => {
    const source = project(), preview = previewHooks(source, 0)[0], changed = structuredClone(source);
    if (change === 'title') changed.title += ' edited';
    if (change === 'text') changed.structure[0].lines[0].text += ' edited';
    if (change === 'style') changed.style.bpm += 5;
    if (change === 'counter') changed.engineState = { ...changed.engineState!, variations: { pending: 1 } };
    const before = JSON.stringify(changed); expect(acceptHook(changed, preview).status).toBe('stale'); expect(JSON.stringify(changed)).toBe(before);
  });

  it('fails safely when requested dependencies are unavailable rather than accepting an unrelated draft', () => {
    const source = project(); source.language.theme = 'theme:not-installed';
    const previews = previewHooks(source, 1);
    expect(previews.every(preview => !preview.draft && preview.diagnostics.length > 0)).toBe(true);
    expect(acceptHook(source, previews[0]).status).toBe('exhausted');
    expect(regenerateProject(source, sectionId).status).toBe('missing-dependency');
  });
});

describe('studio dialect preview/apply and metadata duplication', () => {
  function dialectProject() {
    const source = project(); source.language.dialect = 'British English'; source.language.dialectStrength = 3;
    source.structure[0].lines.forEach((line, i) => { line.text = `Apartment ${i + 1} beside the sidewalk`; line.locked = false; line.authored = i < 2; });
    return source;
  }

  it('preserves authored lines by default, only replacing them explicitly while always honoring section/line/word locks', () => {
    const source = alterDocument(dialectProject(), document => withRevision(document.sections.map((section, i) => i ? section : { ...section, lines: section.lines.map((line, j) => ({ ...line, locked: j === 0, lockedRanges: j === 3 ? [[0, 9]] : [] })) })));
    const original = toEnvelope(source), ordinary = previewStudioDialect(source, sectionId), explicit = previewStudioDialect(source, sectionId, true);
    expect(ordinary.lines[0].text).toBe(original.document.sections[0].lines[0].text); expect(ordinary.lines[1].text).toBe(original.document.sections[0].lines[1].text);
    expect(explicit.lines[0].text).toBe(original.document.sections[0].lines[0].text); expect(explicit.lines[1].text).toContain('flat');
    expect(explicit.lines[3].text).toMatch(/^Apartment/); expect(explicit.lines[3].text).toContain('pavement');
    const current = toEnvelope(applied(applyStudioDialect(source, explicit)));
    expect(current.document.sections[0].lines[0]).toEqual(original.document.sections[0].lines[0]);
    expect(current.document.sections[0].lines[1].origin).toBe('authored');
    const locked = { ...source, structure: source.structure.map(section => section.id === sectionId ? { ...section, locked: true } : section) };
    expect(previewStudioDialect(locked, sectionId, true).preview.edits).toEqual([]);
  });

  it('rejects stale dialect parent state and never writes partial edits', () => {
    const source = dialectProject(), draft = previewStudioDialect(source, sectionId, true);
    const changed = structuredClone(source); changed.style.bpm += 4;
    const before = JSON.stringify(changed); expect(applyStudioDialect(changed, draft).status).toBe('stale'); expect(JSON.stringify(changed)).toBe(before);
    const forged = { ...draft, preview: { ...draft.preview, edits: [...draft.preview.edits, { lineId: source.structure[0].lines[0].id, range: [0, 1] as const, before: 'wrong', after: 'x', ruleId: 'rule-forged' }] } };
    const original = JSON.stringify(source); expect(applyStudioDialect(source, forged).status).toBe('invalid-patch'); expect(JSON.stringify(source)).toBe(original);
  });

  it('copies accepted metadata/locks/history but gives duplicate sections and lines independent identities', () => {
    const generated = applied(regenerateProject(project(), sectionId)), original = toEnvelope(generated), lineIds = generated.structure[0].lines.map((_, i) => `copy-line-${i + 1}`);
    const copy = toEnvelope(duplicateStudioSection(generated, sectionId, 'copy-section', lineIds)), section = copy.blueprint.sections[1], accepted = copy.document.sections[1];
    expect(section.id).toBe('copy-section'); expect(section.generationKey).toBe('copy-section'); expect(section.role).toBe(original.blueprint.sections[0].role);
    expect(accepted.lines.map(line => line.id)).toEqual(lineIds); expect(accepted.lines.map(line => line.text)).toEqual(original.document.sections[0].lines.map(line => line.text));
    expect(accepted.lines.map(line => line.origin)).toEqual(original.document.sections[0].lines.map(line => line.origin));
    expect(accepted.lines.map(line => line.lockedRanges)).toEqual(original.document.sections[0].lines.map(line => line.lockedRanges));
    expect(copy.recipes).toEqual(original.recipes); expect(copy.variations['copy-section']).toBeUndefined();
    const originalAnnotationIds = new Set(original.document.sections.flatMap(section => section.lines.flatMap(line => line.annotations.map(annotation => annotation.id))));
    expect(accepted.lines.flatMap(line => line.annotations).every(annotation => !originalAnnotationIds.has(annotation.id))).toBe(true);
    const next = toEnvelope(applied(regenerateProject(toEditorProject(copy), 'copy-section')));
    expect(next.variations['copy-section']).toBe(1); expect(next.recipes[0]).toEqual(original.recipes[0]);
  });

  it('rejects invalid duplicate identities before any input mutation or decoder repair', () => {
    const source = freeze(project()), before = JSON.stringify(source), ids = source.structure[0].lines.map((_, i) => `copy-${i + 1}`);
    expect(() => duplicateStudioSection(source, sectionId, '', ids)).toThrow();
    expect(() => duplicateStudioSection(source, sectionId, sectionId, ids)).toThrow();
    expect(() => duplicateStudioSection(source, sectionId, 'copy-section', ids.slice(1))).toThrow();
    expect(() => duplicateStudioSection(source, sectionId, 'copy-section', ['', ...ids.slice(1)])).toThrow();
    expect(() => duplicateStudioSection(source, sectionId, 'copy-section', [source.structure[0].lines[0].id, ...ids.slice(1)])).toThrow();
    expect(() => duplicateStudioSection(source, sectionId, 'copy-section', ids.map(() => 'same-line'))).toThrow();
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('manual analysis remains independent of generation availability', () => {
  it('analyzes an empty writing section without a generation-scope error', () => {
    const source = project(); source.structure[0].lines = []; source.structure[0].syllableRange = [3, 5];
    const result = analyzeStudioSection(source, sectionId);
    expect(result.counts).toEqual([]); expect(result.confidence).toEqual([]); expect(result.warnings).toEqual([]); expect(result.range).toEqual([3, 5]);
  });
  it('reports custom meter first, confidence and useful estimates on direct authored text', () => {
    const source = project(); source.structure[0].syllableRange = [2, 3]; source.structure[0].delivery = 'Dense rhythmic';
    source.structure[0].lines[0].text = 'Fire hour'; source.structure[0].lines[1].text = 'Quizzaciously xyzzy';
    source.language.theme = 'theme:not-installed';
    const result = analyzeStudioSection(source, sectionId);
    expect(result.range).toEqual([2, 3]); expect(result.counts[0]).toBe(2);
    expect(result.confidence).toHaveLength(source.structure[0].lines.length); expect(result.confidence.slice(0, 2)).toEqual(['known', 'estimated']);
    expect(result.keys).toHaveLength(source.structure[0].lines.length); expect(result.warnings.length).toBeGreaterThan(0);
    expect(regenerateProject(source, sectionId).status).toBe('missing-dependency');
  });
});
