import { describe, expect, it } from 'vitest';
import { textAnalyzer } from './analysis';
import { freeze } from './catalogs';
import { candidateContextLines, candidateEvaluator, constraintEvaluator } from './constraints';
import type { GenerationContext, LyricCandidate } from './contracts';
import { makeTestCandidate, makeTestContext } from './test-context';

function assess(context: GenerationContext, candidate: LyricCandidate) {
  const lines = candidateContextLines(candidate, context);
  return candidateEvaluator.evaluate(candidate, context, textAnalyzer.analyze(lines, context.catalog.pronunciations));
}
const setPolicy = (context: GenerationContext, hardRuleIds: string[], scoreWeights: Record<string, number>): GenerationContext => ({ ...context, request: { ...context.request, evaluationPolicy: { id: 'policy-a', version: '1.0.0', hardRuleIds, scoreWeights } } });

describe('constraint and candidate policy boundaries', () => {
  it('measures provisional candidate text, leaving accepted text unchanged', () => {
    const context = makeTestContext(), candidate = makeTestCandidate(context, ['One', 'A much longer replacement line tonight']);
    const before = JSON.stringify(context.request.document);
    expect(candidateContextLines(candidate, context).map(line => line.text)).toEqual(candidate.lines.map(line => line.text));
    const result = assess(context, candidate);
    expect(result.diagnostics.some(issue => issue.ruleId === 'cadence' && issue.lineIds.includes('line-1'))).toBe(true);
    expect(JSON.stringify(context.request.document)).toBe(before);
  });

  it('hard-rejects newly generated avoided phrases and clichés when requested by policy', () => {
    const context = makeTestContext();
    const result = assess(context, makeTestCandidate(context, ['A forbidden phrase tonight', 'I keep a heart of gold']));
    expect(result.admissible).toBe(false);
    expect(result.diagnostics.filter(issue => issue.severity === 'error').map(issue => [issue.ruleId, issue.origin])).toEqual([['avoided', 'generated'], ['cliche', 'generated']]);
  });

  it('leaves the same violations advisory without a hard-rule policy', () => {
    const context = setPolicy(makeTestContext(), [], { avoided: 1, cliche: 1 });
    const result = assess(context, makeTestCandidate(context, ['A forbidden phrase tonight', 'I keep a heart of gold']));
    expect(result.admissible).toBe(true);
    expect(result.diagnostics.every(issue => issue.severity !== 'error')).toBe(true);
  });

  it('reports inherited protected violations without making every candidate inadmissible', () => {
    const original = makeTestContext(['A forbidden phrase tonight', 'I grow into the night']);
    const context = { ...original, request: { ...original.request, targetLineIds: ['line-2'], document: { ...original.request.document, sections: [{ ...original.request.document.sections[0], lines: original.request.document.sections[0].lines.map((line, i) => ({ ...line, locked: i === 0 })) }] } } };
    const result = assess(context, makeTestCandidate(context, ['I follow the light']));
    expect(result.admissible).toBe(true);
    expect(result.diagnostics.find(issue => issue.ruleId === 'avoided')).toMatchObject({ severity: 'warning', origin: 'protected', lineIds: ['line-1'] });
  });

  it('gives explicit section ranges precedence over delivery defaults', () => {
    const original = makeTestContext(['I follow the light']);
    const context = { ...original, section: { ...original.section, constraints: { syllableRange: [1, 2] as const, deliveryId: 'delivery:melodic' } } };
    const result = assess(context, makeTestCandidate(context, ['I follow the light']));
    expect(result.diagnostics.find(issue => issue.ruleId === 'cadence')?.message).toContain('1–2');
  });

  it('does not penalize cadence when pronunciation measurement is unknown', () => {
    const context = setPolicy(makeTestContext(['夜']), [], { cadence: 1 });
    const result = assess(context, makeTestCandidate(context, ['夜']));
    expect(result.admissible).toBe(true);
    expect(result.scores.cadence).toBe(1);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ ruleId: 'measurement-unknown', severity: 'info' }));
    expect(result.diagnostics.some(issue => issue.ruleId === 'cadence')).toBe(false);
  });

  it('uses the catalogue delivery range when an explicit range is absent', () => {
    const original = makeTestContext(['I follow the light']);
    const context = { ...original, section: { ...original.section, constraints: { deliveryId: 'delivery:melodic' } } };
    expect(assess(context, makeTestCandidate(context, ['I follow the light'])).diagnostics.find(issue => issue.ruleId === 'cadence')?.message).toContain('7–11');
  });

  it('reports missing delivery references and invalid custom ranges explicitly', () => {
    const original = makeTestContext();
    const missing = { ...original, section: { ...original.section, constraints: { deliveryId: 'delivery:missing' } } };
    expect(assess(missing, makeTestCandidate(missing)).diagnostics).toContainEqual(expect.objectContaining({ ruleId: 'missing-dependency', severity: 'error' }));
    const invalid = { ...original, section: { ...original.section, constraints: { syllableRange: [12, 3] as const } } };
    expect(assess(invalid, makeTestCandidate(invalid)).diagnostics).toContainEqual(expect.objectContaining({ ruleId: 'invalid-input', severity: 'error' }));
  });

  it('keeps cadence, repetition, rhyme and perspective advisory', () => {
    const original = makeTestContext();
    const context = { ...original, language: { ...original.language, intent: { ...original.language.intent, perspective: 'third' as const } } };
    const result = assess(context, makeTestCandidate(context, ['Morning morning morning I go', 'I see a window frame']));
    expect(result.admissible).toBe(true);
    expect(result.diagnostics.map(issue => issue.ruleId)).toEqual(expect.arrayContaining(['perspective', 'repetition', 'rhyme']));
    expect(result.diagnostics.every(issue => issue.severity !== 'error')).toBe(true);
  });

  it('accepts slant rhyme without privileging perfect rhyme in the rhyme score', () => {
    const original = makeTestContext(['road', 'hold']);
    const context = setPolicy({ ...original, section: { ...original.section, constraints: { rhymeScheme: 'AA' } } }, [], { rhyme: 1 });
    const slant = assess(context, makeTestCandidate(context, ['road', 'hold']));
    const perfect = assess(context, makeTestCandidate(context, ['light', 'night']));
    expect(slant.scores.rhyme).toBe(perfect.scores.rhyme);
    expect(slant.diagnostics.some(issue => issue.ruleId === 'rhyme')).toBe(false);
  });

  it.each(['cadence', 'rhyme', 'unknown-rule'])('rejects unsupported hard-rule policy %s', id => {
    const context = setPolicy(makeTestContext(), [id], {});
    const result = assess(context, makeTestCandidate(context));
    expect(result.admissible).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ ruleId: 'invalid-policy', severity: 'error' });
  });

  it.each([NaN, Infinity, -1])('rejects non-finite/negative score weight %s', weight => {
    const context = setPolicy(makeTestContext(), [], { cadence: weight });
    const result = assess(context, makeTestCandidate(context));
    expect(result.admissible).toBe(false);
    expect(result.scores).toEqual({});
    expect(result.diagnostics[0].ruleId).toBe('invalid-policy');
  });

  it('rejects unknown scoring keys instead of silently ignoring them', () => {
    const context = setPolicy(makeTestContext(), [], { invented: 1 });
    expect(assess(context, makeTestCandidate(context)).diagnostics[0].ruleId).toBe('invalid-policy');
  });

  it('normalizes extreme finite weights without overflow and permits zero preferences', () => {
    const context = setPolicy(makeTestContext(), [], { cadence: Number.MAX_VALUE, rhyme: Number.MAX_VALUE });
    const result = assess(context, makeTestCandidate(context));
    expect(Object.values(result.scores).every(Number.isFinite)).toBe(true);
    expect(result.scores).toEqual({ cadence: 0.5, rhyme: 0.5 });
    const zero = setPolicy(context, [], { cadence: 0 });
    expect(assess(zero, makeTestCandidate(zero)).scores).toEqual({ cadence: 0 });
  });

  it('rejects protected/out-of-scope candidate patches and missing analysis coverage', () => {
    const original = makeTestContext();
    const context = { ...original, request: { ...original.request, document: { ...original.request.document, sections: [{ ...original.request.document.sections[0], locked: true }] } } };
    expect(candidateEvaluator.evaluate(makeTestCandidate(context), context, { lines: [], rhymes: [], repeatedTerms: {} }).diagnostics[0].ruleId).toBe('invalid-candidate');
    const candidate = makeTestCandidate(original);
    const analysis = textAnalyzer.analyze(candidateContextLines(candidate, original), original.catalog.pronunciations);
    expect(candidateEvaluator.evaluate(candidate, original, { ...analysis, lines: analysis.lines.slice(1) }).diagnostics[0].ruleId).toBe('invalid-analysis');
  });

  it('evaluates frozen input deterministically without RNG or mutation', () => {
    const context = freeze(makeTestContext()), candidate = freeze(makeTestCandidate(context));
    expect(assess(context, candidate)).toEqual(assess(context, candidate));
    const lines = candidateContextLines(candidate, context);
    expect(constraintEvaluator.evaluate(textAnalyzer.analyze(lines, context.catalog.pronunciations), { ...context, neighbors: lines })).toEqual(assess(context, candidate).diagnostics);
  });
});

describe('measurement evidence and inherited provenance', () => {
  it('rejects stale measurements with matching IDs but different provisional text', () => {
    const context = makeTestContext();
    const original = makeTestCandidate(context);
    const analysis = textAnalyzer.analyze(candidateContextLines(original, context), context.catalog.pronunciations);
    const changed = makeTestCandidate(context, ['Different words here', 'Another altered line']);
    const result = candidateEvaluator.evaluate(changed, context, analysis);
    expect(result.admissible).toBe(false);
    expect(result.diagnostics[0].ruleId).toBe('invalid-analysis');
  });

  it('keeps omitted requested lines inherited instead of treating their violations as new output', () => {
    const context = makeTestContext(['A forbidden phrase tonight', 'I grow into the night']);
    const full = makeTestCandidate(context);
    const partial = { ...full, lines: full.lines.slice(1) };
    const result = assess(context, partial);
    expect(result.admissible).toBe(true);
    expect(result.diagnostics.find(issue => issue.ruleId === 'avoided')).toMatchObject({ severity: 'warning', origin: 'context', lineIds: ['line-1'] });
  });

  it('never lets neighbor metadata downgrade authoritative document locks', () => {
    const base = makeTestContext(['A forbidden phrase tonight', 'I grow into the night']);
    const document = { ...base.request.document, sections: [{ ...base.request.document.sections[0], lines: base.request.document.sections[0].lines.map((line, i) => ({ ...line, locked: i === 0 })) }] };
    const context = { ...base, request: { ...base.request, document }, neighbors: [{ lineId: 'line-1', sectionId: 'section-a', text: 'A forbidden phrase tonight', protected: false, origin: 'generated' as const }] };
    const input = context.request.document.sections[0].lines.map(line => ({ lineId: line.id, sectionId: 'section-a', text: line.text, protected: false }));
    const report = constraintEvaluator.evaluate(textAnalyzer.analyze(input, context.catalog.pronunciations), context);
    expect(report.find(issue => issue.ruleId === 'avoided')).toMatchObject({ origin: 'protected', severity: 'warning' });
  });
});

describe('candidate shape validation', () => {
  it.each([
    { id: '', ordinal: 0, lines: 'valid' },
    { id: 'candidate', ordinal: -1, lines: 'valid' },
    { id: 'candidate', ordinal: 1.5, lines: 'valid' },
    { id: 'candidate', ordinal: 0, lines: 'empty' },
  ])('rejects invalid candidate metadata %j', metadata => {
    const context = makeTestContext(), valid = makeTestCandidate(context);
    const candidate = { ...valid, id: metadata.id, ordinal: metadata.ordinal, lines: metadata.lines === 'empty' ? [] : valid.lines };
    const result = candidateEvaluator.evaluate(candidate, context, { lines: [], rhymes: [], repeatedTerms: {} });
    expect(result.admissible).toBe(false);
    expect(result.diagnostics[0].ruleId).toBe('invalid-candidate');
  });

  it('rejects duplicate slots, duplicate targets and invalid text/annotations', () => {
    const context = makeTestContext(), valid = makeTestCandidate(context);
    const candidates = [
      { ...valid, lines: [valid.lines[0], { ...valid.lines[1], slotId: valid.lines[0].slotId }] },
      { ...valid, lines: [valid.lines[0], { ...valid.lines[1], targetLineId: valid.lines[0].targetLineId }] },
      { ...valid, lines: [{ ...valid.lines[0], text: 123 }] },
      { ...valid, lines: [{ ...valid.lines[0], annotations: null }] },
    ];
    for (const candidate of candidates) {
      const result = candidateEvaluator.evaluate(candidate as unknown as LyricCandidate, context, { lines: [], rhymes: [], repeatedTerms: {} });
      expect(result.admissible).toBe(false);
      expect(result.diagnostics[0].ruleId).toBe('invalid-candidate');
    }
  });
});
