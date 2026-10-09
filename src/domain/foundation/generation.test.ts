import { describe, expect, it } from 'vitest';
import fixedFixture from './generation-fixture.json';
import { catalog, generationCatalog, legacyGenerationCatalog, freeze, immutableView } from './catalogs';
import { documentApplicator, withRevision } from './editing';
import { createDefaultProfile, createGenerationCoordinator, defaultEvaluationPolicy, defaultProfile, generationCoordinator, languageResolver, legacyCandidateGenerator, makeRecipe, structurePlanner } from './generation';
import { namedRandom } from './randomness';
import { makeTestContext } from './test-context';
import type { CandidateGenerator, CatalogSnapshot, GenerationContext, GenerationRequest, GenerationResult, LyricCandidate } from './contracts';

function request(texts: readonly string[] = ['', '', '', '']): GenerationRequest {
  const context = makeTestContext(texts);
  return { ...context.request, document: withRevision(context.request.document.sections), profile: defaultProfile, evaluationPolicy: defaultEvaluationPolicy, budget: { maxAttempts: 16, maxCandidates: 3 }, blueprint: { ...context.request.blueprint, style: { ...context.request.blueprint.style, genres: [{ id: 'indie-folk', weight: 1 }] } } };
}
function ready(result: GenerationResult) {
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(JSON.stringify(result));
  return result;
}
function contextFor(input: GenerationRequest): GenerationContext {
  const source = makeTestContext();
  const language = languageResolver.resolve(input.blueprint.language, generationCatalog);
  if (language.status !== 'resolved') throw new Error('Fixture language invalid');
  return { ...source, request: input, section: input.blueprint.sections[0], language: language.value, catalog: generationCatalog };
}
function chorus(input: GenerationRequest, hookArchetype: 'title-drop' | 'refrain' | 'statement'): GenerationRequest {
  return { ...input, blueprint: { ...input.blueprint, sections: input.blueprint.sections.map(section => ({ ...section, type: 'chorus', role: 'resolve', hookArchetype })) } };
}

describe('language and structure resolution', () => {
  it('resolves existing semantic banks by theme identity without banned-word prefiltering', () => {
    const input = request();
    const language = languageResolver.resolve({ ...input.blueprint.language, avoidedTerms: ['map', 'compass'] }, generationCatalog);
    expect(language.status).toBe('resolved');
    if (language.status !== 'resolved') return;
    expect(language.value.eligibleVocabularyIds.every(id => generationCatalog.vocabulary.get(id)?.themeIds.includes('theme:finding'))).toBe(true);
    expect(language.value.eligibleVocabularyIds.map(id => generationCatalog.vocabulary.get(id)?.text)).toContain('compass');
  });

  it('reports unavailable themes/registers and invalid weights explicitly', () => {
    const intent = request().blueprint.language;
    expect(languageResolver.resolve({ ...intent, themeIds: [{ id: 'theme:missing', weight: 1 }] }, generationCatalog).status).toBe('missing-dependency');
    expect(languageResolver.resolve({ ...intent, registerId: 'language:missing' }, generationCatalog).status).toBe('missing-dependency');
    expect(languageResolver.resolve({ ...intent, themeIds: [{ id: 'theme:finding', weight: NaN }] }, generationCatalog).status).toBe('invalid-input');
  });

  it('plans every requested editable line while preserving locks and authored text', () => {
    const original = request(['Written by me', '', '', '']);
    const document = withRevision(original.document.sections.map(section => ({ ...section, lines: section.lines.map((line, i) => ({ ...line, origin: i === 0 ? 'authored' as const : line.origin, locked: i === 1 })) })));
    const context = contextFor({ ...original, document });
    const plan = structurePlanner.plan(context);
    expect(plan.status).toBe('resolved');
    if (plan.status !== 'resolved') return;
    expect(plan.value.editableSlots.map(slot => slot.targetLineId)).toEqual(['line-3', 'line-4']);
    expect(plan.value.protectedLines.map(line => line.id)).toEqual(['line-1', 'line-2']);
  });

  it('rejects unsupported existing template archetypes and uses explicit meter before defaults', () => {
    const input = chorus(request(), 'title-drop');
    const context = contextFor({ ...input, blueprint: { ...input.blueprint, sections: [{ ...input.blueprint.sections[0], constraints: { syllableRange: [3, 5], deliveryId: 'delivery:melodic' } }] } });
    const plan = structurePlanner.plan(context);
    if (plan.status !== 'resolved') throw new Error('Missing plan');
    expect(plan.value.editableSlots[0].constraints.syllableRange).toEqual([3, 5]);
    expect(structurePlanner.plan({ ...context, section: { ...context.section, hookArchetype: 'question' } }).status).toBe('missing-dependency');
  });
});

describe('bounded deterministic candidate search', () => {
  it('pins literal profile, ranked candidate text/trace/evaluation and selection', () => {
    const input = freeze(fixedFixture.request as unknown as GenerationRequest);
    expect(createDefaultProfile(legacyGenerationCatalog)).toEqual(input.profile);
    expect(generationCoordinator.generate(input, legacyGenerationCatalog)).toEqual(fixedFixture.expected);
  });

  it('accepts expanded Rap/Trap styles with independent moods deterministically', () => {
    const source = request();
    const input = freeze({ ...source, blueprint: { ...source.blueprint, style: {
      ...source.blueprint.style,
      genres: [{ id: 'rap', weight: 60 }, { id: 'trap', weight: 40 }],
      moods: [{ id: 'mood:dark', weight: 50 }, { id: 'mood:chill', weight: 50 }],
    } } });
    const result = ready(generationCoordinator.generate(input, generationCatalog));
    expect(generationCoordinator.generate(input, generationCatalog)).toEqual(result);
  });

  it('repeats full candidate text, scoring and selection from frozen inputs without writes', () => {
    const input = freeze(request());
    const before = JSON.stringify(input);
    const first = ready(generationCoordinator.generate(input, generationCatalog));
    expect(first).toEqual(generationCoordinator.generate(input, generationCatalog));
    expect(first.candidates).toHaveLength(3);
    expect(first.candidates.every(entry => entry.candidate.lines.length === 4)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each(['title-drop', 'refrain', 'statement'] as const)('realizes only existing %s hook templates including title/motif/claim', archetype => {
    const input = chorus(request(), archetype);
    const result = ready(generationCoordinator.generate(input, generationCatalog));
    const text = result.candidates.flatMap(entry => entry.candidate.lines.map(line => line.text)).join('\n');
    expect(text).not.toMatch(/\{(title|motif|object|claim)\}/);
    if (archetype === 'title-drop') expect(text).toContain('Compass');
    if (archetype === 'refrain') expect(text).toContain('compass');
    if (archetype === 'statement') expect(text).toContain('I can be uncertain and still go');
  });

  it('exhausts explicitly when every line is protected, preserving the document', () => {
    const input = request(), document = withRevision([{ ...input.document.sections[0], locked: true }]);
    const before = JSON.stringify(document);
    expect(generationCoordinator.generate({ ...input, document }, generationCatalog).status).toBe('exhausted');
    expect(JSON.stringify(document)).toBe(before);
  });

  it('evaluates generated avoided phrases after composition and exhausts within the exact budget', () => {
    let attempts = 0;
    const composer: CandidateGenerator = { compose(context, plan, random, ordinal) {
      attempts++; const original = legacyCandidateGenerator.compose(context, plan, random, ordinal);
      return { ...original, lines: original.lines.map(line => ({ ...line, text: 'forbidden phrase' })) };
    } };
    const input = request();
    const result = createGenerationCoordinator({ composer }).generate(input, generationCatalog);
    expect(result.status).toBe('exhausted');
    expect(attempts).toBe(input.budget.maxAttempts);
    if (result.status !== 'ready') expect(result.diagnostics.some(issue => issue.ruleId === 'avoided')).toBe(true);
  });

  it('does not shift later attempt streams when an earlier candidate is rejected or consumes extra random draws', () => {
    function runner(rejectFirst: boolean) {
      const captured: LyricCandidate[] = [];
      const composer: CandidateGenerator = { compose(context, plan, random, ordinal) {
        const candidate = legacyCandidateGenerator.compose(context, plan, random, ordinal);
        captured.push(candidate);
        if (ordinal === 0 && rejectFirst) { for (let i = 0; i < 100; i++) random.next(); return { ...candidate, lines: candidate.lines.map(line => ({ ...line, text: 'forbidden phrase' })) }; }
        return candidate;
      } };
      createGenerationCoordinator({ composer }).generate(request(), generationCatalog);
      return captured;
    }
    const baseline = runner(false), rejected = runner(true);
    expect(rejected.slice(1)).toEqual(baseline.slice(1));
  });

  it('deduplicates identical accepted text and resolves equal scores by attempt ordinal', () => {
    const composer: CandidateGenerator = { compose(context, plan, _random, ordinal) { return { id: `candidate-${ordinal}`, ordinal, lines: plan.editableSlots.map(slot => ({ ...slot, text: 'The light holds the night', annotations: [] })), trace: { templateIds: [], vocabularyIds: [] } }; } };
    const result = ready(createGenerationCoordinator({ composer }).generate(request(), generationCatalog));
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].candidate.ordinal).toBe(0);
  });

  it('rejects reused candidate identities and deduplicates semantically identical line ordering', () => {
    const reused: CandidateGenerator = { compose(context, plan, random, ordinal) { return { ...legacyCandidateGenerator.compose(context, plan, random, ordinal), id: 'same-id' }; } };
    expect(createGenerationCoordinator({ composer: reused }).generate(request(), generationCatalog).status).toBe('invalid-input');
    const reordered: CandidateGenerator = { compose(_context, plan, _random, ordinal) {
      const lines = plan.editableSlots.map(slot => ({ slotId: slot.slotId, targetLineId: slot.targetLineId, text: 'The light holds the night', annotations: [] }));
      return { id: `candidate-${ordinal}`, ordinal, lines: ordinal % 2 ? lines.reverse() : lines, trace: { templateIds: [], vocabularyIds: [] } };
    } };
    expect(ready(createGenerationCoordinator({ composer: reordered }).generate(request(), generationCatalog)).candidates).toHaveLength(1);
  });

  it('rejects incomplete editable-slot coverage instead of accepting partial candidates', () => {
    const composer: CandidateGenerator = { compose(context, plan, random, ordinal) { const candidate = legacyCandidateGenerator.compose(context, plan, random, ordinal); return { ...candidate, lines: candidate.lines.slice(1) }; } };
    expect(createGenerationCoordinator({ composer }).generate(request(), generationCatalog).status).toBe('invalid-input');
  });

  it('applies optional dialect guidance before final measurement without mutating accepted text', () => {
    const input = request();
    const dialectInput = { ...input, blueprint: { ...input.blueprint, language: { ...input.blueprint.language, dialect: { packId: 'dialect:british', strength: 2 as const, mode: 'vocabulary' as const } } } };
    const composer: CandidateGenerator = { compose(_context, plan, _random, ordinal) { return { id: `candidate-${ordinal}`, ordinal, lines: plan.editableSlots.map(slot => ({ slotId: slot.slotId, targetLineId: slot.targetLineId, text: 'The apartment opens to the night', annotations: [] })), trace: { templateIds: [], vocabularyIds: [] } }; } };
    const result = ready(createGenerationCoordinator({ composer }).generate(dialectInput, generationCatalog));
    expect(result.candidates[0].candidate.lines[0].text).toBe('The flat opens to the night');
    expect(input.document.sections[0].lines[0].text).toBe('');
    const authoredSlots = { ...dialectInput, document: withRevision(dialectInput.document.sections.map(section => ({ ...section, lines: section.lines.map(line => ({ ...line, origin: 'authored' as const })) }))) };
    expect(ready(createGenerationCoordinator({ composer }).generate(authoredSlots, generationCatalog)).candidates[0].candidate.lines[0].text).toBe('The flat opens to the night');
  });
});

describe('request/profile and recipe boundaries', () => {
  it.each([-1, 2 ** 32, 1.5])('rejects invalid new root seed %s', rootSeed => {
    const input = request();
    expect(generationCoordinator.generate({ ...input, blueprint: { ...input.blueprint, rootSeed } }, generationCatalog).status).toBe('invalid-input');
  });

  it.each([{ maxAttempts: 129, maxCandidates: 1 }, { maxAttempts: 16, maxCandidates: 17 }, { maxAttempts: 2, maxCandidates: 3 }])('rejects invalid bounded budget %j', budget => {
    expect(generationCoordinator.generate({ ...request(), budget }, generationCatalog).status).toBe('invalid-input');
  });

  it('rejects duplicate keys/IDs, invalid scope/count/intensity/ranges/variation and policies', () => {
    const input = request();
    const malformed = [
      { ...input, variation: -1 },
      { ...input, variation: Number.MAX_SAFE_INTEGER + 1 },
      { ...input, blueprint: { ...input.blueprint, sections: [{ ...input.blueprint.sections[0], name: 123 }] } } as unknown as GenerationRequest,
      { ...input, targetLineIds: ['line-1', 'line-1'] },
      { ...input, targetLineIds: ['missing'] },
      { ...input, blueprint: { ...input.blueprint, sections: [...input.blueprint.sections, input.blueprint.sections[0]] } },
      { ...input, blueprint: { ...input.blueprint, sections: [{ ...input.blueprint.sections[0], intensity: NaN }] } },
      { ...input, blueprint: { ...input.blueprint, sections: [{ ...input.blueprint.sections[0], lineCount: 3 }] } },
      { ...input, blueprint: { ...input.blueprint, sections: [{ ...input.blueprint.sections[0], constraints: { syllableRange: [9, 3] as const } }] } },
      { ...input, evaluationPolicy: { ...input.evaluationPolicy, hardRuleIds: ['cadence'] } },
    ];
    malformed.forEach(value => expect(generationCoordinator.generate(value, generationCatalog).status).toBe('invalid-input'));
  });

  it('rejects arbitrary algorithm/pack refs and modified catalog content under matching hashes', () => {
    const input = request();
    const changedProfile = { ...input.profile, algorithms: { ...input.profile.algorithms, composition: { id: 'unsupported', version: '9' } } };
    expect(generationCoordinator.generate({ ...input, profile: changedProfile }, generationCatalog).status).toBe('missing-dependency');
    const changedHash = { ...input.profile, packs: input.profile.packs.map(pack => ({ ...pack, contentHash: 'forged' })) };
    expect(generationCoordinator.generate({ ...input, profile: changedHash }, generationCatalog).status).toBe('missing-dependency');
    const forged: CatalogSnapshot = { ...generationCatalog, templates: immutableView(generationCatalog.templates.all().map((entry, i) => i === 0 ? { ...entry, pattern: 'Injected new content' } : entry)) };
    expect(generationCoordinator.generate(input, forged).status).toBe('missing-dependency');
    expect(() => createDefaultProfile(forged)).toThrow('No supported');
  });

  it('normalizes pack order and reports malformed catalogue views without throwing', () => {
    const input = request(), reordered = { ...generationCatalog, packs: [...generationCatalog.packs].reverse() };
    expect(createDefaultProfile(reordered)).toEqual(defaultProfile);
    expect(generationCoordinator.generate(input, reordered)).toEqual(generationCoordinator.generate(input, generationCatalog));
    const malformed = { ...generationCatalog, templates: null } as unknown as CatalogSnapshot;
    expect(() => generationCoordinator.generate(input, malformed)).not.toThrow();
    expect(generationCoordinator.generate(input, malformed).status).toBe('missing-dependency');
  });

  it('rejects malformed style and narrative intent even before those facts influence composition', () => {
    const input = request();
    for (const blueprint of [{ ...input.blueprint, style: null }, { ...input.blueprint, narrative: null }, { ...input.blueprint, narrative: { ...input.blueprint.narrative, narratorId: '' } }]) expect(generationCoordinator.generate({ ...input, blueprint } as unknown as GenerationRequest, generationCatalog).status).toBe('invalid-input');
  });

  it('supports explicit bundled base profiles without claiming unavailable claim metadata', () => {
    const base = { ...request(), profile: createDefaultProfile(catalog) };
    expect(generationCoordinator.generate(base, catalog).status).toBe('ready');
    expect(generationCoordinator.generate(chorus(base, 'statement'), catalog).status).toBe('missing-dependency');
  });

  it('retains immutable original inputs in a deterministic recipe that the atomic applicator accepts', () => {
    const input = request();
    const candidate = ready(generationCoordinator.generate(input, generationCatalog)).candidates[0].candidate;
    const recipe = makeRecipe(input, candidate);
    expect(recipe).toEqual(makeRecipe(input, candidate));
    expect(recipe.inputs.baselineDocument).not.toBe(input.document);
    expect(Object.isFrozen(recipe.inputs)).toBe(true);
    const result = documentApplicator.apply(input.document, { kind: 'candidate', sectionId: input.sectionId, expectedRevision: input.document.revision, replacementPolicy: input.replacementPolicy, candidate, recipe });
    expect(result.status).toBe('applied');
  });

  it('rejects invalid candidate ordinals, incomplete scope and inadmissible text in recipes', () => {
    const input = request(), candidate = ready(generationCoordinator.generate(input, generationCatalog)).candidates[0].candidate;
    for (const malformed of [{ ...candidate, ordinal: input.budget.maxAttempts }, { ...candidate, lines: candidate.lines.slice(1) }, { ...candidate, lines: candidate.lines.map(line => ({ ...line, text: 'forbidden phrase' })) }]) expect(() => makeRecipe(input, malformed)).toThrow();
  });

  it('keeps named generation streams independent of style draws', () => {
    const input = request(), first = generationCoordinator.generate(input, generationCatalog);
    const style = namedRandom(input.blueprint.rootSeed, ['style']); for (let i = 0; i < 100; i++) style.next();
    expect(generationCoordinator.generate(input, generationCatalog)).toEqual(first);
  });
});
