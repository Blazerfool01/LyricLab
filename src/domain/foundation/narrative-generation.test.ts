import { describe, expect, it } from 'vitest';
import fixture from './generation-fixture.json';
import narrativeFixture from './narrative-fixture.json';
import { generationCatalog, legacyGenerationCatalog, freeze } from './catalogs';
import { documentApplicator, withRevision } from './editing';
import { defaultEvaluationPolicy, makeRecipe } from './generation';
import { effectManifest, foundationCoordinator, legacyNarrativeCatalog, legacyNarrativeProfile, narrativeCatalog, narrativeProfile } from './narrative-generation';
import { narrativeReducer } from './narrative';
import { makeTestContext } from './test-context';
import type { GenerationRequest, GenerationResult } from './contracts';
function request(): GenerationRequest {
  const source = makeTestContext(['', '', '', '']).request;
  return { ...source, document: withRevision(source.document.sections), profile: narrativeProfile, evaluationPolicy: defaultEvaluationPolicy, budget: { maxAttempts: 16, maxCandidates: 3 }, blueprint: { ...source.blueprint, style: { ...source.blueprint.style, genres: [{ id: 'indie-folk', weight: 1 }] } } };
}
function ready(result: GenerationResult) { if (result.status !== 'ready') throw new Error(JSON.stringify(result)); return result; }
describe('annotation-backed composition', () => {
  it('reproduces the literal historical F profile result', () => {
    expect(legacyNarrativeProfile).toEqual((narrativeFixture.request as unknown as GenerationRequest).profile);
    expect(foundationCoordinator.generate(narrativeFixture.request as unknown as GenerationRequest, legacyNarrativeCatalog)).toEqual(narrativeFixture.expected);
  });
  it('retains the literal E profile result through the new registry', () => {
    expect(foundationCoordinator.generate(fixture.request as unknown as GenerationRequest, legacyGenerationCatalog)).toEqual(fixture.expected);
  });
  it('uses roles to distinguish existing establish/develop patterns deterministically', () => {
    const input = freeze(request());
    const establish = ready(foundationCoordinator.generate(input, narrativeCatalog));
    expect(foundationCoordinator.generate(input, narrativeCatalog)).toEqual(establish);
    expect(establish.candidates.every(entry => entry.candidate.trace.templateIds.every(id => Number(id.split(':').at(-1)) <= 4))).toBe(true);
    const develop = ready(foundationCoordinator.generate({ ...input, blueprint: { ...input.blueprint, sections: input.blueprint.sections.map(section => ({ ...section, role: 'develop' })) } }, narrativeCatalog));
    expect(develop.candidates.every(entry => entry.candidate.trace.templateIds.every(id => Number(id.split(':').at(-1)) > 4))).toBe(true);
  });
  it('adds motif evidence only after atomic acceptance and uses it to avoid repeating imagery', () => {
    const initial = request();
    const next = { ...initial.blueprint.sections[0], id: 'next', generationKey: 'next-key' };
    const input = { ...initial, blueprint: { ...initial.blueprint, sections: [...initial.blueprint.sections, next] }, document: withRevision([...initial.document.sections, { ...initial.document.sections[0], sectionId: 'next', lines: initial.document.sections[0].lines.map(line => ({ ...line, id: `${line.id}-next` })) }]) };
    const generated = ready(foundationCoordinator.generate(input, narrativeCatalog));
    const candidate = generated.candidates.find(entry => entry.candidate.lines.some(line => line.annotations.length))?.candidate;
    expect(candidate).toBeDefined();
    if (!candidate) throw new Error('Missing annotation fixture');
    expect(narrativeReducer.derive(input.blueprint, input.document, 'next')).toMatchObject({ status: 'resolved', value: { motifIds: [] } });
    const applied = documentApplicator.apply(input.document, { kind: 'candidate', expectedRevision: input.document.revision, sectionId: input.sectionId, replacementPolicy: input.replacementPolicy, candidate, recipe: makeRecipe(input, candidate, narrativeCatalog) });
    if (applied.status !== 'applied') throw new Error(JSON.stringify(applied));
    expect(narrativeReducer.derive(input.blueprint, applied.document, 'next')).toMatchObject({ status: 'resolved', value: { motifIds: ['theme:finding:object:1'] } });
    const following = ready(foundationCoordinator.generate({ ...input, document: applied.document, sectionId: 'next', targetLineIds: applied.document.sections[1].lines.map(line => line.id) }, narrativeCatalog));
    expect(following.candidates.every(entry => !entry.candidate.trace.templateIds.includes('theme:finding:verse:1'))).toBe(true);
  });
  it('validates additive metadata references without changing phrase patterns', () => {
    for (const [id, effects] of Object.entries(effectManifest)) {
      expect(narrativeCatalog.templates.get(id)?.pattern).toBe(generationCatalog.templates.get(id)?.pattern);
      for (const effect of effects) if (effect.kind === 'motif' && effect.motif.kind === 'literal') expect(narrativeCatalog.vocabulary.get(String(effect.motif.value))).toBeDefined();
    }
  });
  it('does not establish narrator facts after clipping or perspective changes', () => {
    const original = request();
    const themed = { ...original, blueprint: { ...original.blueprint, language: { ...original.blueprint.language, themeIds: [{ id: 'theme:ambition', weight: 1 }] } } };
    for (const mode of ['clipped', 'third'] as const) {
      const input = { ...themed, blueprint: { ...themed.blueprint, language: { ...themed.blueprint.language, perspective: mode === 'third' ? 'third' as const : 'first' as const }, sections: themed.blueprint.sections.map(section => ({ ...section, constraints: { ...section.constraints, ...(mode === 'clipped' ? { deliveryId: 'delivery:clipped' } : {}) } })) } };
      // Resolve the stable catalogue ID from its display definition for this regression.
      const clippedId = narrativeCatalog.choices.all().find(choice => choice.label === 'Short / clipped')!.id;
      const normalized = mode === 'clipped' ? { ...input, blueprint: { ...input.blueprint, sections: input.blueprint.sections.map(section => ({ ...section, constraints: { ...section.constraints, deliveryId: clippedId } })) } } : input;
      const result = ready(foundationCoordinator.generate(normalized, narrativeCatalog));
      expect(result.candidates.every(entry => entry.candidate.lines.every(line => line.annotations.every(annotation => annotation.effect.kind !== 'assert')))).toBe(true);
    }
  });
  it('requires the exact metadata pack and preserves E catalogs', () => {
    expect(foundationCoordinator.generate(request(), generationCatalog).status).toBe('missing-dependency');
    expect(generationCatalog.templates.all().every(template => template.effects.length === 0)).toBe(true);
  });
});
