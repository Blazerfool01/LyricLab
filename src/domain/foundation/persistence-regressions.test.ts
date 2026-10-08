import { describe, expect, it } from 'vitest';
import legacy from '../fixtures/legacy-v0.1.json';
import narrativeFixture from './narrative-fixture.json';
import { decodeProject, replayRecipe, serializeProject, toEnvelope, toEditorProject } from './persistence';
import { makeRecipe } from './generation';
import { foundationCoordinator, narrativeCatalog } from './narrative-generation';
import type { GenerationRequest, ProjectEnvelope } from './contracts';
import type { Project } from '../types';
const resolve = (value: unknown): ProjectEnvelope => { const decoded = decodeProject(value); if (decoded.status !== 'resolved') throw new Error(JSON.stringify(decoded)); return decoded.value; };
describe('conservative storage boundary regressions', () => {
  it('retains valid lyrics through invalid optional legacy choices and fixed seed repair', () => {
    const original = structuredClone(legacy.input.project);
    const changed = { ...original, seed: 'invalid', style: { ...original.style, bpm: -100, genres: [...original.style.genres, { id: 'future-genre', weight: -2 }] }, language: { ...original.language, perspective: 'invalid' } };
    const decoded = decodeProject(changed);
    expect(decoded.status).toBe('resolved');
    if (decoded.status !== 'resolved') return;
    expect(decoded.diagnostics.length).toBeGreaterThan(1);
    expect(decoded.value.document.sections.flatMap(section => section.lines.map(line => line.text))).toEqual(original.structure.flatMap(section => section.lines.map(line => line.text)));
    expect(Number.isInteger(decoded.value.blueprint.rootSeed)).toBe(true);
  });
  it('keeps repaired legacy weight aggregation finite and serializable', () => {
    const source = structuredClone(legacy.input.project);
    const decoded = resolve({ ...source, style: { ...source.style, genres: [{ id: 'indie-folk', weight: Number.MAX_VALUE }, { id: 'indie-folk', weight: Number.MAX_VALUE }] } });
    expect(decoded.blueprint.style.genres.every(choice => Number.isFinite(choice.weight))).toBe(true);
    expect(() => serializeProject(decoded)).not.toThrow();
  });
  it('retains inspectable structurally valid recipes when their contract generation is unavailable', () => {
    const request = narrativeFixture.request as unknown as GenerationRequest;
    const result = foundationCoordinator.generate(request, narrativeCatalog);
    if (result.status !== 'ready') throw new Error('Invalid fixed fixture');
    const recipe = makeRecipe(request, result.candidates[0].candidate, narrativeCatalog);
    const unsupported = { ...recipe, profile: { ...recipe.profile, contractVersion: 2 } };
    const source = toEnvelope(legacy.input.project as unknown as Project);
    const decoded = resolve({ ...source, recipes: [unsupported] });
    expect(decoded.recipes).toEqual([unsupported]);
    expect(replayRecipe(decoded.recipes[0]).status).toBe('missing-dependency');
    expect(decoded.document).toEqual(source.document);
  });
  it('remaps variation counters to repaired generation keys without rewriting historical namespaces', () => {
    const source = toEnvelope(legacy.input.project as unknown as Project);
    const blueprint = { ...source.blueprint, sections: source.blueprint.sections.map(section => ({ ...section, generationKey: 'duplicate-key' })) };
    const decoded = resolve({ ...source, blueprint, variations: { 'duplicate-key': 7, 'historical:key': 3 } });
    for (const section of decoded.blueprint.sections) expect(decoded.variations[section.generationKey]).toBe(7);
    expect(decoded.variations['historical:key']).toBe(3);
  });
  it('preserves protection conservatively for malformed present lock values', () => {
    const source = toEnvelope(legacy.input.project as unknown as Project);
    const decoded = resolve({ ...source, document: { ...source.document, sections: source.document.sections.map((section, i) => i ? section : { ...section, locked: 'true', lines: section.lines.map((line, j) => j ? line : { ...line, origin: 'generated', locked: 'true' }) }) } });
    expect(decoded.document.sections[0].locked).toBe(true);
    expect(decoded.document.sections[0].lines[0].locked).toBe(true);
  });
  it('promotes stale word spans to a whole-line lock without losing historical recipe lineage', () => {
    const source = toEnvelope(legacy.input.project as unknown as Project);
    const changed = resolve({ ...source, document: { ...source.document, sections: source.document.sections.map((section, i) => i ? section : { ...section, lines: section.lines.map((line, j) => j ? line : { ...line, lockedRanges: [[0, 3]], recipeId: 'historical:recipe' }) }) } });
    const view = toEditorProject(changed);
    view.structure[0].lines[0].text = 'A';
    view.structure[0].lines[0].authored = true;
    const roundtrip = toEnvelope(view).document.sections[0].lines[0];
    expect(roundtrip).toMatchObject({ text: 'A', locked: true, lockedRanges: [], annotations: [], origin: 'authored', recipeId: 'historical:recipe' });
  });
});
