import { describe, expect, it } from 'vitest';
import { freeze } from './catalogs';
import { withRevision } from './editing';
import { narrativeReducer, applyTemplateEffects } from './narrative';
import { fingerprint } from './randomness';
import { makeTestContext } from './test-context';
import type { DocumentLine, LyricDocument, SemanticAnnotation, SemanticEffect, SongBlueprint, TemplateEffectDeclaration } from './contracts';

function fixture(): { blueprint: SongBlueprint; document: LyricDocument } {
  const source = makeTestContext(['Accepted thought']);
  const sections = ['establish', 'develop', 'resolve'].map((role, i) => ({ ...source.section, id: `section-${i + 1}`, generationKey: `key-${i + 1}`, role: role as 'establish' | 'develop' | 'resolve', lineCount: 1 }));
  return { blueprint: { ...source.request.blueprint, sections, narrative: { narratorId: 'narrator-a', subjectIds: ['subject-b'], goals: [{ id: 'planned-goal', description: 'Planned, not established', status: 'resolved' }] } }, document: withRevision(sections.map((section, i) => ({ sectionId: section.id, locked: false, lines: [{ ...source.request.document.sections[0].lines[0], id: `line-${i + 1}`, text: `Accepted thought ${i + 1}` }] }))) };
}
const effect = (id = 'fact-a', value: string | boolean = 'uncertain', timeFrameId = 'now', polarity: 'positive' | 'negative' = 'positive'): SemanticEffect => ({ kind: 'assert', assertion: { id, subjectId: 'narrator-a', predicateId: 'state', value, polarity, timeFrameId } });
function annotation(line: DocumentLine, semantic: SemanticEffect, suffix = 'a'): SemanticAnnotation { return { id: `${line.id}:${suffix}`, evidence: 'user-confirmed', textFingerprint: fingerprint(line.text), effect: semantic }; }
function annotate(document: LyricDocument, index: number, effects: readonly SemanticEffect[]): LyricDocument {
  return withRevision(document.sections.map((section, i) => i !== index ? section : { ...section, lines: section.lines.map(line => ({ ...line, annotations: effects.map((semantic, j) => annotation(line, semantic, String(j))) })) }));
}
function resolved(blueprint: SongBlueprint, document: LyricDocument, boundary = 'section-3') {
  const result = narrativeReducer.derive(blueprint, document, boundary);
  expect(result.status).toBe('resolved');
  if (result.status !== 'resolved') throw new Error(JSON.stringify(result));
  return result;
}

describe('accepted annotation-driven narrative state', () => {
  it('reduces preceding accepted sections only, excluding current/later facts and planned goals', () => {
    const { blueprint, document } = fixture();
    const annotated = annotate(annotate(annotate(document, 0, [effect('fact-first')]), 1, [effect('fact-current')]), 2, [effect('fact-later')]);
    expect(resolved(blueprint, annotated, 'section-2').value).toEqual({ assertions: [expect.objectContaining({ id: 'fact-first' })], goals: [], motifIds: [], provenance: { 'fact-first': ['line-1'] } });
    expect(resolved(blueprint, annotated, 'section-1').value.assertions).toEqual([]);
  });

  it('does not invent facts from unannotated manual text or lexical motif mentions', () => {
    const { blueprint, document } = fixture();
    const manual = withRevision(document.sections.map(section => ({ ...section, lines: section.lines.map(line => ({ ...line, origin: 'authored' as const, text: 'I am certain now, and the compass means home' })) })));
    expect(resolved(blueprint, manual).value).toEqual({ assertions: [], goals: [], motifIds: [], provenance: {} });
  });

  it('accepts both confirmed manual annotations and anchored template-declared evidence', () => {
    const { blueprint, document } = fixture();
    const manual = annotate(document, 0, [effect('manual-fact')]);
    const line = manual.sections[1].lines[0];
    const generated = withRevision(manual.sections.map((section, i) => i !== 1 ? section : { ...section, lines: [{ ...line, annotations: [{ ...annotation(line, effect('template-fact', 'hopeful')), evidence: 'template-declared' }] }] }));
    expect(resolved(blueprint, generated).value.assertions.map(assertion => assertion.id)).toEqual(['manual-fact', 'template-fact']);
  });

  it('ignores stale evidence after text changes and explains the uncertainty', () => {
    const { blueprint, document } = fixture();
    const original = annotate(document, 0, [effect()]);
    const edited = withRevision(original.sections.map((section, i) => i !== 0 ? section : { ...section, lines: section.lines.map(line => ({ ...line, text: 'Manual edit now questions the old belief' })) }));
    const result = resolved(blueprint, edited);
    expect(result.value.assertions).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ ruleId: 'stale-annotation', severity: 'warning', lineIds: ['line-1'] });
  });

  it('warns on malformed optional evidence and dangling subjects without losing accepted text', () => {
    const { blueprint, document } = fixture();
    const line = document.sections[0].lines[0];
    const dangling: SemanticEffect = { kind: 'assert', assertion: { ...(effect() as Extract<SemanticEffect, { kind: 'assert' }>).assertion, subjectId: 'missing-subject' } };
    const invalid = withRevision([{ ...document.sections[0], lines: [{ ...line, annotations: [annotation(line, dangling), null] as unknown as SemanticAnnotation[] }] }, ...document.sections.slice(1)]);
    const before = JSON.stringify(invalid);
    const result = resolved(blueprint, invalid);
    expect(result.value.assertions).toEqual([]);
    expect(result.diagnostics.map(issue => issue.ruleId)).toEqual(['invalid-annotation', 'invalid-annotation']);
    expect(JSON.stringify(invalid)).toBe(before);
  });

  it('tracks goal updates, motifs and every accepted source line', () => {
    const { blueprint, document } = fixture();
    const goal = { id: 'goal-a', description: 'Find a direction', status: 'developed' as const };
    const first = annotate(document, 0, [{ kind: 'goal', goal }, { kind: 'motif', motifId: 'motif:compass' }]);
    const second = annotate(first, 1, [{ kind: 'goal', goal: { ...goal, status: 'resolved' } }, { kind: 'motif', motifId: 'motif:compass' }]);
    expect(resolved(blueprint, second).value).toEqual({ assertions: [], goals: [{ ...goal, status: 'resolved' }], motifIds: ['motif:compass'], provenance: { 'goal-a': ['line-1', 'line-2'], 'motif:compass': ['line-1', 'line-2'] } });
  });

  it('advises on incompatible simultaneous values or polarities without blocking interpretation', () => {
    const { blueprint, document } = fixture();
    const conflict = annotate(annotate(document, 0, [effect('fact-a', 'uncertain')]), 1, [effect('fact-b', 'certain'), effect('fact-c', 'uncertain', 'now', 'negative')]);
    const result = resolved(blueprint, conflict);
    expect(result.value.assertions).toHaveLength(3);
    expect(result.diagnostics.some(issue => issue.ruleId === 'narrative-contradiction')).toBe(true);
    expect(result.diagnostics.every(issue => issue.severity === 'warning')).toBe(true);
  });

  it('does not flag temporal changes as simultaneous contradictions', () => {
    const { blueprint, document } = fixture();
    const temporal = annotate(annotate(document, 0, [effect('past-fact', 'uncertain', 'past')]), 1, [effect('present-fact', 'certain', 'now')]);
    expect(resolved(blueprint, temporal).diagnostics).toEqual([]);
  });

  it('retains prior evidence when a manual assertion ID is reused for a different fact', () => {
    const { blueprint, document } = fixture();
    const accepted = annotate(annotate(document, 0, [effect('same-id', 'uncertain', 'past')]), 1, [effect('same-id', 'certain', 'now')]);
    const result = resolved(blueprint, accepted);
    expect(result.value.assertions).toEqual([(effect('same-id', 'uncertain', 'past') as Extract<SemanticEffect, { kind: 'assert' }>).assertion]);
    expect(result.value.provenance).toEqual({ 'same-id': ['line-1'] });
    expect(result.diagnostics.map(issue => issue.ruleId)).toEqual(['invalid-annotation']);
  });

  it('compares only assertions with the same subject and predicate', () => {
    const { blueprint, document } = fixture();
    const otherSubject = { kind: 'assert' as const, assertion: { ...(effect('other-subject', 'certain') as Extract<SemanticEffect, { kind: 'assert' }>).assertion, subjectId: 'subject-b' } };
    const otherPredicate = { kind: 'assert' as const, assertion: { ...(effect('other-predicate', 'certain') as Extract<SemanticEffect, { kind: 'assert' }>).assertion, predicateId: 'direction' } };
    const accepted = annotate(annotate(document, 0, [effect()]), 1, [otherSubject, otherPredicate]);
    expect(resolved(blueprint, accepted).diagnostics).toEqual([]);
  });

  it('ignores uncertain evidence, invalid goal states and cross-kind identity collisions', () => {
    const { blueprint, document } = fixture();
    const line = document.sections[0].lines[0];
    const accepted = withRevision([{ ...document.sections[0], lines: [{ ...line, annotations: [
      annotation(line, effect('shared'), 'valid'),
      { ...annotation(line, effect('uncertain'), 'uncertain'), evidence: 'inferred' },
      annotation(line, { kind: 'goal', goal: { id: 'invalid-goal', description: 'Invalid', status: 'invented' } } as unknown as SemanticEffect, 'bad-goal'),
      annotation(line, { kind: 'motif', motifId: 'shared' }, 'collision'),
    ] as unknown as SemanticAnnotation[] }] }, ...document.sections.slice(1)]);
    const result = resolved(blueprint, accepted);
    expect(result.value.assertions.map(assertion => assertion.id)).toEqual(['shared']);
    expect(result.value.goals).toEqual([]);
    expect(result.value.motifIds).toEqual([]);
    expect(result.diagnostics.map(issue => issue.ruleId)).toEqual(['invalid-annotation', 'invalid-annotation', 'invalid-annotation']);
  });

  it('reconstructs boundary state after blueprint reordering, independently of document array order', () => {
    const { blueprint, document } = fixture();
    const accepted = annotate(annotate(document, 0, [effect('fact-1')]), 1, [effect('fact-2')]);
    const reordered = { ...blueprint, sections: [blueprint.sections[1], blueprint.sections[0], blueprint.sections[2]] };
    const shuffledDocument = withRevision([...accepted.sections].reverse());
    expect(resolved(reordered, shuffledDocument, 'section-1').value.assertions.map(assertion => assertion.id)).toEqual(['fact-2']);
  });

  it('rejects structural duplicate IDs, invalid roles, counts, revisions and unavailable boundaries', () => {
    const { blueprint, document } = fixture();
    expect(narrativeReducer.derive(blueprint, document, 'missing').status).toBe('invalid-input');
    expect(narrativeReducer.derive(blueprint, { ...document, revision: 'wrong' }, 'section-3').status).toBe('invalid-input');
    const badRole = { ...blueprint, sections: [{ ...blueprint.sections[0], role: 'invented' }, ...blueprint.sections.slice(1)] } as unknown as SongBlueprint;
    expect(narrativeReducer.derive(badRole, document, 'section-3').status).toBe('invalid-input');
    const badCount = { ...blueprint, sections: [{ ...blueprint.sections[0], lineCount: 99 }, ...blueprint.sections.slice(1)] };
    expect(narrativeReducer.derive(badCount, document, 'section-3').status).toBe('invalid-input');
    const duplicate = withRevision(document.sections.map(section => ({ ...section, lines: section.lines.map(line => ({ ...line, id: 'same-line' })) })));
    expect(narrativeReducer.derive(blueprint, duplicate, 'section-3').status).toBe('invalid-input');
  });

  it('is deterministic with frozen inputs and never mutates accepted state', () => {
    const input = fixture(), document = freeze(annotate(input.document, 0, [effect()])), blueprint = freeze(input.blueprint);
    const before = JSON.stringify({ blueprint, document });
    expect(narrativeReducer.derive(blueprint, document, 'section-3')).toEqual(narrativeReducer.derive(blueprint, document, 'section-3'));
    expect(JSON.stringify({ blueprint, document })).toBe(before);
  });
});

describe('candidate-local declarative template effects', () => {
  const declarations: readonly TemplateEffectDeclaration[] = [{ kind: 'assert', id: 'declared-fact', subject: { kind: 'slot', slotId: 'narrator' }, predicateId: 'state', value: { kind: 'literal', value: 'uncertain' }, polarity: 'positive', timeFrame: { kind: 'literal', value: 'now' } }, { kind: 'motif', motif: { kind: 'slot', slotId: 'motif' } }];

  it('resolves typed bindings into anchored annotations without establishing facts before acceptance', () => {
    const input = fixture();
    const result = applyTemplateEffects(declarations, { narrator: 'narrator-a', motif: 'motif:compass' }, 'I remain uncertain', 'candidate-a');
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.value).toEqual([{ id: 'candidate-a:effect:1', evidence: 'template-declared', textFingerprint: fingerprint('I remain uncertain'), effect: effect('candidate-a:assertion:declared-fact') }, { id: 'candidate-a:effect:2', evidence: 'template-declared', textFingerprint: fingerprint('I remain uncertain'), effect: { kind: 'motif', motifId: 'motif:compass' } }]);
    expect(resolved(input.blueprint, input.document).value.assertions).toEqual([]);
    // A rejected candidate's local annotations never enter the accepted document.
    expect(resolved(input.blueprint, input.document).value.motifIds).toEqual([]);
  });

  it('fails explicitly for missing, non-scalar or incorrectly typed identifier bindings', () => {
    expect(applyTemplateEffects(declarations, {}, 'text', 'candidate').status).toBe('invalid-input');
    expect(applyTemplateEffects(declarations, { narrator: 3, motif: 'motif-a' }, 'text', 'candidate').status).toBe('invalid-input');
    expect(applyTemplateEffects(declarations, { narrator: 'narrator-a', motif: NaN }, 'text', 'candidate').status).toBe('invalid-input');
    expect(applyTemplateEffects([declarations[0], declarations[0]], { narrator: 'narrator-a' }, 'text', 'candidate').status).toBe('invalid-input');
    expect(applyTemplateEffects([{ ...declarations[0], subject: { kind: 'slot', slotId: '' } } as TemplateEffectDeclaration], { '': 'narrator-a' }, 'text', 'candidate').status).toBe('invalid-input');
  });

  it('retains literal goal declarations as effects rather than blueprint state', () => {
    const result = applyTemplateEffects([{ kind: 'goal', goal: { id: 'central-claim', description: 'Express the central theme claim', status: 'developed' } }], {}, 'I can be uncertain and still go', 'statement');
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') expect(result.value[0].effect).toMatchObject({ kind: 'goal', goal: { id: 'central-claim', status: 'developed' } });
  });

  it('instantiates repeated template declarations as separate accepted temporal facts', () => {
    const { blueprint, document } = fixture();
    const firstLine = document.sections[0].lines[0], secondLine = document.sections[1].lines[0];
    const past = applyTemplateEffects([{ ...declarations[0], timeFrame: { kind: 'literal', value: 'past' } } as TemplateEffectDeclaration], { narrator: 'narrator-a' }, firstLine.text, 'line-1');
    const now = applyTemplateEffects([declarations[0]], { narrator: 'narrator-a' }, secondLine.text, 'line-2');
    expect(past.status).toBe('resolved'); expect(now.status).toBe('resolved');
    if (past.status !== 'resolved' || now.status !== 'resolved') return;
    const accepted = withRevision(document.sections.map((section, i) => i > 1 ? section : { ...section, lines: [{ ...section.lines[0], annotations: i === 0 ? past.value : now.value }] }));
    const result = resolved(blueprint, accepted);
    expect(result.value.assertions.map(assertion => assertion.id)).toEqual(['line-1:assertion:declared-fact', 'line-2:assertion:declared-fact']);
    expect(result.value.assertions.map(assertion => assertion.timeFrameId)).toEqual(['past', 'now']);
    expect(result.diagnostics).toEqual([]);
  });
});
