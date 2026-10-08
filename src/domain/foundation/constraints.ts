import { containsPhrase } from './analysis';
import { fingerprint } from './randomness';
import { isLineProtected } from './editing';
import type { CandidateEvaluation, CandidateEvaluator, ConstraintEvaluator, ContextLine, Diagnostic, GenerationContext, LyricCandidate, TextAnalysis } from './contracts';

export const supportedRuleIds = ['avoided', 'cliche', 'cadence', 'rhyme', 'repetition', 'perspective'] as const;
const hardEligible = new Set(['avoided', 'cliche']);
const cliches = ['heart of gold', 'chasing dreams', 'broken wings'];
const diagnostic = (ruleId: string, message: string, lineIds: readonly string[] = [], severity: Diagnostic['severity'] = 'warning', origin: Diagnostic['origin'] = 'context'): Diagnostic => ({ ruleId, message, lineIds, severity, origin });
/** Provisional text only; this helper never applies a candidate to the accepted document. */
export function candidateContextLines(candidate: LyricCandidate, context: GenerationContext): readonly ContextLine[] {
  if (typeof candidate.id !== 'string' || !candidate.id.trim() || !Number.isInteger(candidate.ordinal) || candidate.ordinal < 0 || !Array.isArray(candidate.lines) || !candidate.lines.length) throw new Error('Candidate requires an ID, nonnegative ordinal and nonempty lines');
  const slots = new Set<string>();
  for (const line of candidate.lines) {
    if (!line || typeof line.slotId !== 'string' || !line.slotId.trim() || slots.has(line.slotId) || typeof line.text !== 'string' || !Array.isArray(line.annotations)) throw new Error('Candidate lines require unique slots, text and annotation arrays');
    slots.add(line.slotId);
  }
  const section = context.request.document.sections.find(section => section.sectionId === context.section.id);
  if (!section || context.request.sectionId !== context.section.id) throw new Error('Missing or mismatched document section');
  const updates = new Map<string, string>();
  for (const line of candidate.lines) {
    const existing = section.lines.find(existing => existing.id === line.targetLineId);
    if (!existing || !context.request.targetLineIds.includes(line.targetLineId) || updates.has(line.targetLineId)) throw new Error('Invalid candidate target mapping');
    if (isLineProtected(section, existing, context.request.replacementPolicy)) throw new Error('Candidate targets protected content');
    updates.set(line.targetLineId, line.text);
  }
  return section.lines.map(line => ({ lineId: line.id, sectionId: section.sectionId, text: updates.get(line.id) ?? line.text, origin: updates.has(line.id) ? 'generated' : 'context', protected: isLineProtected(section, line, context.request.replacementPolicy) }));
}
function contextLines(context: GenerationContext): readonly ContextLine[] {
  const section = context.request.document.sections.find(section => section.sectionId === context.section.id);
  const lines = section?.lines.map(line => ({ lineId: line.id, sectionId: section.sectionId, text: line.text, protected: isLineProtected(section, line, context.request.replacementPolicy) })) || [];
  const overrides = new Map(context.neighbors.map(line => [line.lineId, line]));
  return lines.map(line => { const override = overrides.get(line.lineId); return override ? { ...line, text: override.text, origin: override.origin } : line; });
}
function policyDiagnostics(context: GenerationContext): Diagnostic[] {
  const policy = context.request.evaluationPolicy;
  if (!policy || !policy.id || !policy.version || !Array.isArray(policy.hardRuleIds) || !policy.scoreWeights || typeof policy.scoreWeights !== 'object') return [diagnostic('invalid-policy', 'Evaluation requires a versioned policy with hard rules and scoring weights.', [], 'error')];
  const issues: Diagnostic[] = [];
  for (const id of policy.hardRuleIds) if (!hardEligible.has(id)) issues.push(diagnostic('invalid-policy', `Unsupported hard rule “${id}”. Only generated avoided/cliche violations are hard eligible.`, [], 'error'));
  for (const [id, weight] of Object.entries(policy.scoreWeights)) if (!(supportedRuleIds as readonly string[]).includes(id) || !Number.isFinite(weight) || weight < 0) issues.push(diagnostic('invalid-policy', `Unsupported score or invalid weight “${id}”; weights must be finite and nonnegative.`, [], 'error'));
  return issues;
}
function effectiveRange(context: GenerationContext): { range?: readonly [number, number]; issues: Diagnostic[] } {
  const constraints = context.section.constraints;
  let range = constraints.syllableRange;
  if (!range && constraints.deliveryId) {
    const delivery = context.catalog.choices.get(constraints.deliveryId);
    if (!delivery || delivery.category !== 'delivery') return { issues: [diagnostic('missing-dependency', `Delivery “${constraints.deliveryId}” is unavailable.`, [], 'error')] };
    range = delivery.range;
  }
  if (range && (range.length !== 2 || !range.every(value => Number.isFinite(value) && value > 0) || range[0] > range[1])) return { issues: [diagnostic('invalid-input', 'Syllable range must have ordered positive finite bounds.', [], 'error')] };
  return { range, issues: [] };
}
function analysisDiagnostics(analysis: TextAnalysis, lines: readonly ContextLine[]): Diagnostic[] {
  const ids = analysis.lines.map(line => line.lineId);
  if (new Set(ids).size !== ids.length || ids.length !== lines.length || lines.some(line => !ids.includes(line.lineId)) || analysis.lines.some(line => !Number.isFinite(line.syllables) || line.syllables < 0 || line.textFingerprint !== fingerprint(lines.find(source => source.lineId === line.lineId)?.text ?? '')) || analysis.rhymes.some(relation => !Number.isFinite(relation.confidence) || relation.confidence < 0 || relation.confidence > 1 || relation.lineIds.some(id => !ids.includes(id)))) return [diagnostic('invalid-analysis', 'Analysis must cover the current section with unique IDs and finite valid measurements.', [], 'error')];
  return [];
}
export const constraintEvaluator: ConstraintEvaluator = {
  evaluate(analysis, context) {
    const lines = contextLines(context);
    const effective = effectiveRange(context);
    const scopeIssues = context.section.id !== context.request.sectionId || !context.request.document.sections.some(section => section.sectionId === context.section.id) ? [diagnostic('invalid-input', 'Context and request require the same available document section.', [], 'error')] : [];
    const issues = [...scopeIssues, ...policyDiagnostics(context), ...effective.issues, ...analysisDiagnostics(analysis, lines)];
    if (issues.length) return issues;
    const hardRules = context.request.evaluationPolicy.hardRuleIds;
    const origin = (line: ContextLine): Diagnostic['origin'] => line.protected ? 'protected' : line.origin === 'generated' ? 'generated' : 'context';
    const warnings: Diagnostic[] = [];
    for (const line of lines) {
      if (!line.text.trim()) continue;
      for (const [rule, terms] of [['avoided', context.language.intent.avoidedTerms], ['cliche', cliches]] as const) for (const term of terms.filter(term => term.trim())) if (containsPhrase(line.text, term)) warnings.push(diagnostic(rule, `The line includes ${rule === 'avoided' ? 'the avoided phrase' : 'the cliché'} “${term}”.`, [line.lineId], origin(line) === 'generated' && hardRules.includes(rule) ? 'error' : 'warning', origin(line)));
      const measurement = analysis.lines.find(item => item.lineId === line.lineId)!;
      if (measurement.confidence === 'unknown') warnings.push(diagnostic('measurement-unknown', 'Pronunciation is unavailable; cadence cannot be assessed reliably for this line.', [line.lineId], 'info', origin(line)));
      if (measurement.confidence !== 'unknown' && effective.range && (measurement.syllables < effective.range[0] || measurement.syllables > effective.range[1])) warnings.push(diagnostic('cadence', `About ${measurement.syllables} syllables; the effective target is ${effective.range[0]}–${effective.range[1]}.`, [line.lineId], 'warning', origin(line)));
      const firstPerson = /\b(i|me|my|mine|we|our|us)\b/i.test(line.text);
      const secondPerson = /\b(you|your|yours)\b/i.test(line.text);
      const perspective = context.language.intent.perspective;
      if ((perspective === 'third' && (firstPerson || secondPerson)) || (perspective === 'second' && firstPerson)) warnings.push(diagnostic('perspective', 'Pronouns may differ from the chosen perspective; direct address and quotations can be intentional.', [line.lineId], 'warning', origin(line)));
    }
    const rhyme = context.section.constraints.rhymeScheme;
    if (rhyme) for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) if (rhyme[i % rhyme.length] === rhyme[j % rhyme.length] && lines[i].text.trim() && lines[j].text.trim()) {
      const relation = analysis.rhymes.find(item => item.lineIds.includes(lines[i].lineId) && item.lineIds.includes(lines[j].lineId));
      if (!relation || relation.kind === 'unknown') warnings.push(diagnostic('rhyme', 'Expected end-rhyme relationship is uncertain; slant rhyme remains valid.', [lines[i].lineId, lines[j].lineId], 'warning', lines[i].protected && lines[j].protected ? 'protected' : 'context'));
    }
    for (const [term, count] of Object.entries(analysis.repeatedTerms).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) if (count > 2 && context.section.constraints.repetitionPreference !== 'high') {
      const related = lines.filter(line => containsPhrase(line.text, term));
      warnings.push(diagnostic('repetition', `“${term}” appears ${count} times; repetition can be intentional.`, related.map(line => line.lineId), 'warning', related.every(line => line.protected) ? 'protected' : 'context'));
    }
    return warnings;
  },
};
export const candidateEvaluator: CandidateEvaluator = {
  evaluate(candidate, context, analysis): CandidateEvaluation {
    let lines: readonly ContextLine[];
    try { lines = candidateContextLines(candidate, context); }
    catch (error) { return { candidateId: candidate.id, admissible: false, scores: {}, diagnostics: [diagnostic('invalid-candidate', error instanceof Error ? error.message : 'Invalid candidate.', Array.isArray(candidate.lines) ? candidate.lines.filter(line => typeof line?.targetLineId === 'string').map(line => line.targetLineId) : [], 'error')] }; }
    const provisional = { ...context, neighbors: lines };
    const diagnostics = constraintEvaluator.evaluate(analysis, provisional);
    const invalid = diagnostics.some(issue => ['invalid-policy', 'invalid-input', 'missing-dependency', 'invalid-analysis'].includes(issue.ruleId));
    if (invalid) return { candidateId: candidate.id, admissible: false, scores: {}, diagnostics };
    const weights = Object.entries(context.request.evaluationPolicy.scoreWeights).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const largest = Math.max(0, ...weights.map(([, value]) => value));
    const total = weights.reduce((sum, [, weight]) => sum + (largest ? weight / largest : 0), 0);
    const scores = Object.fromEntries(weights.map(([id, weight]) => {
      const violations = diagnostics.filter(issue => issue.ruleId === id).length;
      const quality = 1 / (1 + violations);
      return [id, total ? quality * (weight / largest) / total : 0];
    }));
    return { candidateId: candidate.id, admissible: !diagnostics.some(issue => issue.severity === 'error'), scores, diagnostics };
  },
};
