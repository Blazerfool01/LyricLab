import { describe, expect, it } from 'vitest';
import { freeze } from './catalogs';
import { documentApplicator, isLineProtected, isRangeProtected, outputFingerprint, withRevision } from './editing';
import { fingerprint } from './randomness';
import { makeTestCandidate, makeTestContext } from './test-context';
import type { CandidatePatch, DocumentLine, DocumentSection, LyricDocument, ReplacementPolicy, SemanticAnnotation, TransformationPatch } from './contracts';

const generate: ReplacementPolicy = { operation: 'generate', authored: 'preserve' };
const explicitGenerate: ReplacementPolicy = { operation: 'generate', authored: 'replace-explicitly' };
const dialect: ReplacementPolicy = { operation: 'dialect', authored: 'preserve' };
const annotation = (text: string): SemanticAnnotation => ({ id: 'annotation-a', evidence: 'template-declared', textFingerprint: fingerprint(text), effect: { kind: 'motif', motifId: 'motif-a' } });
function doc(texts = ['The apartment faces north', 'I follow the night']): LyricDocument {
  const source = makeTestContext(texts).request.document;
  return withRevision(source.sections);
}
function amend(document: LyricDocument, changes: Partial<DocumentLine>, index = 0): LyricDocument {
  return withRevision(document.sections.map(section => ({ ...section, lines: section.lines.map((line, i) => i === index ? { ...line, ...changes } : line) })));
}
function candidatePatch(document: LyricDocument, policy = generate): CandidatePatch {
  const source = makeTestContext(document.sections[0].lines.map(line => line.text));
  const context = { ...source, request: { ...source.request, document, replacementPolicy: policy } };
  const candidate = makeTestCandidate(context, ['New words in the light', 'New words in the night']);
  const inputs = { blueprint: context.request.blueprint, baselineDocument: document, sectionId: context.section.id, targetLineIds: context.request.targetLineIds, replacementPolicy: policy, evaluationPolicy: context.request.evaluationPolicy, budget: context.request.budget };
  return { kind: 'candidate', sectionId: context.section.id, expectedRevision: document.revision, replacementPolicy: policy, candidate, recipe: { id: 'recipe-a', inputs, inputFingerprint: fingerprint(inputs), profile: context.request.profile, rootSeed: context.request.blueprint.rootSeed, generationKey: context.section.generationKey, variation: 0, candidateOrdinal: candidate.ordinal, outputFingerprint: outputFingerprint(candidate) } };
}
function transform(document: LyricDocument, range: readonly [number, number] = [4, 13], before = 'apartment', after = 'flat'): TransformationPatch {
  return { kind: 'transformation', replacementPolicy: dialect, preview: { expectedRevision: document.revision, edits: [{ lineId: document.sections[0].lines[0].id, range, before, after, ruleId: 'british:apartment' }], pronunciationHints: [], diagnostics: [] } };
}
const applied = (document: LyricDocument, patch: CandidatePatch | TransformationPatch): LyricDocument => {
  const result = documentApplicator.apply(document, patch);
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error(JSON.stringify(result));
  return result.document;
};

describe('shared protection policy', () => {
  it('protects nonempty authored and unknown origins by default but allows empty writing slots', () => {
    const section = doc().sections[0], base = section.lines[0];
    for (const origin of ['authored', 'unknown'] as const) {
      expect(isLineProtected(section, { ...base, origin }, generate)).toBe(true);
      expect(isLineProtected(section, { ...base, origin }, explicitGenerate)).toBe(false);
      expect(isLineProtected(section, { ...base, origin, text: '' }, generate)).toBe(false);
    }
  });

  it('never bypasses section, line or generation range locks under explicit replacement', () => {
    const section = doc().sections[0], base = section.lines[0];
    expect(isLineProtected({ ...section, locked: true }, base, explicitGenerate)).toBe(true);
    expect(isLineProtected(section, { ...base, locked: true }, explicitGenerate)).toBe(true);
    const ranged = { ...base, lockedRanges: [[4, 13] as const] };
    expect(isLineProtected(section, ranged, explicitGenerate)).toBe(true);
    expect(isLineProtected(section, ranged, dialect, false)).toBe(false);
    expect(isRangeProtected(ranged, [4, 13])).toBe(true);
    expect(isRangeProtected(ranged, [0, 3])).toBe(false);
    expect(isRangeProtected(ranged, [5, 5])).toBe(true);
  });
});

describe('atomic candidate application', () => {
  it('sets accepted text, origin, recipe and revision without mutating source or untouched sections/lines', () => {
    const source = doc();
    const extra: DocumentSection = { sectionId: 'section-b', locked: false, lines: [{ ...source.sections[0].lines[0], id: 'extra-line' }] };
    const document = freeze(withRevision([...source.sections, extra]));
    const full = candidatePatch(document);
    const candidate = { ...full.candidate, lines: full.candidate.lines.slice(0, 1) };
    const patch = { ...full, candidate, recipe: { ...full.recipe, outputFingerprint: outputFingerprint(candidate) } };
    const result = applied(document, patch);
    expect(result.sections[0].lines[0]).toMatchObject({ text: 'New words in the light', origin: 'generated', recipeId: 'recipe-a' });
    expect(result.sections[0].lines[1]).toBe(document.sections[0].lines[1]);
    expect(result.sections[1]).toBe(extra);
    expect(result.revision).toBe(fingerprint(result.sections));
    expect(document.sections[0].lines[0].text).toBe('The apartment faces north');
  });

  it('accepts anchored annotations while rejecting stale semantic evidence', () => {
    const document = doc(), initial = candidatePatch(document);
    const line = initial.candidate.lines[0];
    const candidate = { ...initial.candidate, lines: [{ ...line, annotations: [annotation(line.text)] }, initial.candidate.lines[1]] };
    const valid = { ...initial, candidate, recipe: { ...initial.recipe, outputFingerprint: outputFingerprint(candidate) } };
    expect(applied(document, valid).sections[0].lines[0].annotations).toEqual(candidate.lines[0].annotations);
    const staleCandidate = { ...candidate, lines: [{ ...candidate.lines[0], annotations: [annotation('Old different text')] }, candidate.lines[1]] };
    expect(documentApplicator.apply(document, { ...valid, candidate: staleCandidate }).status).toBe('invalid-patch');
  });

  it.each(['authored', 'unknown'] as const)('requires explicit replacement for nonempty %s text', origin => {
    const document = amend(doc(), { origin });
    expect(documentApplicator.apply(document, candidatePatch(document)).status).toBe('protected');
    expect(documentApplicator.apply(document, candidatePatch(document, explicitGenerate)).status).toBe('applied');
  });

  it('rejects the entire candidate when a later line is locked', () => {
    const document = amend(doc(), { locked: true }, 1), before = JSON.stringify(document);
    expect(documentApplicator.apply(document, candidatePatch(document, explicitGenerate)).status).toBe('protected');
    expect(JSON.stringify(document)).toBe(before);
  });

  it('rejects section/range locks even with explicit replacement', () => {
    const source = doc();
    const sectionLocked = withRevision([{ ...source.sections[0], locked: true }]);
    expect(documentApplicator.apply(sectionLocked, candidatePatch(sectionLocked, explicitGenerate)).status).toBe('protected');
    const rangeLocked = amend(source, { lockedRanges: [[4, 13]] });
    expect(documentApplicator.apply(rangeLocked, candidatePatch(rangeLocked, explicitGenerate)).status).toBe('protected');
  });

  it('rejects stale and internally inconsistent current document revisions', () => {
    const document = doc(), patch = candidatePatch(document);
    expect(documentApplicator.apply(amend(document, { text: 'Changed accepted text' }), patch).status).toBe('stale');
    expect(documentApplicator.apply({ ...document, revision: 'forged' }, patch).status).toBe('invalid-patch');
  });

  it('rejects forged recipe input, output, scope, seed, attempt, profile and policy', () => {
    const document = doc(), patch = candidatePatch(document);
    const recipes = [
      { ...patch.recipe, inputFingerprint: 'forged' }, { ...patch.recipe, outputFingerprint: 'forged' },
      { ...patch.recipe, rootSeed: 1 }, { ...patch.recipe, generationKey: 'wrong-key' },
      { ...patch.recipe, candidateOrdinal: 5 }, { ...patch.recipe, variation: -1 },
      { ...patch.recipe, profile: { ...patch.recipe.profile, contractVersion: 2 } },
      { ...patch.recipe, inputs: { ...patch.recipe.inputs, sectionId: 'other-section' } },
      { ...patch.recipe, inputs: { ...patch.recipe.inputs, replacementPolicy: explicitGenerate } },
    ];
    for (const recipe of recipes) expect(documentApplicator.apply(document, { ...patch, recipe } as CandidatePatch).status).toBe('invalid-patch');
  });

  it('rejects invalid attempt budgets and target IDs outside the recorded section', () => {
    const document = doc(), patch = candidatePatch(document);
    for (const budget of [{ maxAttempts: 1, maxCandidates: 2 }, { maxAttempts: 0, maxCandidates: 1 }]) {
      const inputs = { ...patch.recipe.inputs, budget };
      expect(documentApplicator.apply(document, { ...patch, recipe: { ...patch.recipe, inputs, inputFingerprint: fingerprint(inputs) } }).status).toBe('invalid-patch');
    }
    const inputs = { ...patch.recipe.inputs, targetLineIds: [...patch.recipe.inputs.targetLineIds, 'missing-target'] };
    expect(documentApplicator.apply(document, { ...patch, recipe: { ...patch.recipe, inputs, inputFingerprint: fingerprint(inputs) } }).status).toBe('invalid-patch');
    const candidate = { ...patch.candidate, ordinal: patch.recipe.inputs.budget.maxAttempts };
    const recipe = { ...patch.recipe, candidateOrdinal: candidate.ordinal };
    expect(documentApplicator.apply(document, { ...patch, candidate, recipe }).status).toBe('invalid-patch');
  });

  it('rejects duplicate/out-of-section mappings and unapproved candidate operations', () => {
    const document = doc(), patch = candidatePatch(document);
    const candidates = [
      { ...patch.candidate, lines: [patch.candidate.lines[0], { ...patch.candidate.lines[1], targetLineId: patch.candidate.lines[0].targetLineId }] },
      { ...patch.candidate, lines: [{ ...patch.candidate.lines[0], targetLineId: 'missing-line' }] },
      { ...patch.candidate, lines: [] },
    ];
    candidates.forEach(candidate => expect(documentApplicator.apply(document, { ...patch, candidate }).status).toBe('invalid-patch'));
    expect(documentApplicator.apply(document, { ...patch, replacementPolicy: dialect }).status).toBe('invalid-patch');
  });

  it('fingerprints accepted output independently of candidate identity, ordinal and trace', () => {
    const candidate = candidatePatch(doc()).candidate;
    expect(outputFingerprint(candidate)).toBe(outputFingerprint({ ...candidate, id: 'other-candidate', ordinal: 9, trace: { templateIds: ['other-template'], vocabularyIds: [] } }));
    expect(outputFingerprint(candidate)).not.toBe(outputFingerprint({ ...candidate, lines: [{ ...candidate.lines[0], text: 'changed' }] }));
  });
});

describe('atomic transformation application', () => {
  it('applies descending edits, clears stale annotations and preserves historical recipe lineage', () => {
    const document = amend(doc(), { annotations: [annotation('The apartment faces north')], recipeId: 'historical-recipe' });
    const patch = transform(document);
    const result = applied(document, patch);
    expect(result.sections[0].lines[0]).toMatchObject({ text: 'The flat faces north', annotations: [], recipeId: 'historical-recipe', origin: 'generated' });
    expect(result.sections[0].lines[1]).toBe(document.sections[0].lines[1]);
  });

  it('shifts locked spans after earlier edits while preserving the exact protected word', () => {
    const document = amend(doc(), { lockedRanges: [[20, 25]] });
    const result = applied(document, transform(document));
    expect(result.sections[0].lines[0].lockedRanges).toEqual([[15, 20]]);
    expect(result.sections[0].lines[0].text.slice(15, 20)).toBe('north');
    const forbidden = transform(document, [20, 25], 'north', 'south');
    expect(documentApplicator.apply(document, forbidden).status).toBe('protected');
  });

  it('does not apply an eligible edit when a later edit touches a locked word', () => {
    const document = freeze(amend(doc(), { lockedRanges: [[20, 25]] }));
    const initial = transform(document);
    const patch = { ...initial, preview: { ...initial.preview, edits: [...initial.preview.edits, { lineId: 'line-1', range: [20, 25] as const, before: 'north', after: 'south', ruleId: 'test:direction' }] } };
    const before = JSON.stringify(document);
    expect(documentApplicator.apply(document, patch).status).toBe('protected');
    expect(JSON.stringify(document)).toBe(before);
    expect(document.sections[0].lines[0].text).toBe('The apartment faces north');
    expect(document.sections[0].lines[0].lockedRanges).toEqual([[20, 25]]);
  });

  it('applies several nonoverlapping edits using original-text coordinates', () => {
    const document = doc(), initial = transform(document);
    const patch = { ...initial, preview: { ...initial.preview, edits: [...initial.preview.edits, { lineId: 'line-1', range: [20, 25] as const, before: 'north', after: 'the bright east', ruleId: 'test:direction' }] } };
    expect(applied(document, patch).sections[0].lines[0].text).toBe('The flat faces the bright east');
  });

  it('rejects mismatching before text, invalid ranges and overlaps without partial edits', () => {
    const document = doc(), initial = transform(document), before = JSON.stringify(document);
    const patches = [transform(document, [4, 13], 'wrong'), transform(document, [-1, 13]), transform(document, [13, 4]), { ...initial, preview: { ...initial.preview, edits: [...initial.preview.edits, { lineId: 'line-1', range: [5, 13] as const, before: 'partment', after: 'room', ruleId: 'test:overlap' }] } }];
    for (const patch of patches) expect(documentApplicator.apply(document, patch).status).toBe('invalid-patch');
    expect(JSON.stringify(document)).toBe(before);
  });

  it('never bypasses word, section or line locks and requires explicit authored replacement', () => {
    for (const changes of [{ locked: true }, { lockedRanges: [[4, 13] as const] }]) {
      const document = amend(doc(), changes), patch = transform(document);
      expect(documentApplicator.apply(document, { ...patch, replacementPolicy: { operation: 'dialect', authored: 'replace-explicitly' } }).status).toBe('protected');
    }
    const source = doc(), sectionLocked = withRevision([{ ...source.sections[0], locked: true }]);
    expect(documentApplicator.apply(sectionLocked, transform(sectionLocked)).status).toBe('protected');
    const authored = amend(source, { origin: 'authored' });
    expect(documentApplicator.apply(authored, transform(authored)).status).toBe('protected');
    expect(documentApplicator.apply(authored, { ...transform(authored), replacementPolicy: { operation: 'dialect', authored: 'replace-explicitly' } }).status).toBe('applied');
  });

  it('returns original document identity for an empty valid preview', () => {
    const document = doc(), initial = transform(document);
    expect(applied(document, { ...initial, preview: { ...initial.preview, edits: [] } })).toBe(document);
  });
});
