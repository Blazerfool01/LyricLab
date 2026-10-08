import { fingerprint } from './randomness';
import type { Diagnostic, DocumentLine, LyricDocument, NarrativeGoal, NarrativeReducer, NarrativeState, Resolution, SemanticAnnotation, SemanticAssertion, SemanticEffect, SongBlueprint, TemplateBinding, TemplateEffectDeclaration } from './contracts';

const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const scalar = (value: unknown): value is string | number | boolean => ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value));
const goalStatuses = ['open', 'developed', 'challenged', 'resolved'];
const validGoal = (goal: NarrativeGoal) => !!goal && id(goal.id) && typeof goal.description === 'string' && goalStatuses.includes(goal.status);
const validAssertion = (assertion: SemanticAssertion) => !!assertion && [assertion.id, assertion.subjectId, assertion.predicateId, assertion.timeFrameId].every(id) && scalar(assertion.value) && ['positive', 'negative'].includes(assertion.polarity);
const report = (ruleId: string, message: string, lineId?: string, protectedLine = false): Diagnostic => ({ ruleId, message, lineIds: lineId ? [lineId] : [], origin: protectedLine ? 'protected' : 'context', severity: ruleId === 'invalid-input' ? 'error' : 'warning' });
function structuralGuard(blueprint: SongBlueprint, document: LyricDocument, boundary: string): void {
  if (!blueprint || !id(blueprint.id) || !Array.isArray(blueprint.sections) || !blueprint.narrative || !id(blueprint.narrative.narratorId) || !Array.isArray(blueprint.narrative.subjectIds) || blueprint.narrative.subjectIds.some(subject => !id(subject)) || new Set(blueprint.narrative.subjectIds).size !== blueprint.narrative.subjectIds.length || !Array.isArray(blueprint.narrative.goals) || blueprint.narrative.goals.some(goal => !validGoal(goal)) || new Set(blueprint.narrative.goals.map(goal => goal.id)).size !== blueprint.narrative.goals.length) throw new Error('Invalid blueprint narrative identities or planned goals');
  const sections = new Set<string>(), keys = new Set<string>();
  for (const section of blueprint.sections) {
    if (!section || !id(section.id) || !id(section.generationKey) || sections.has(section.id) || keys.has(section.generationKey) || !['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'custom'].includes(section.type) || !['establish', 'develop', 'challenge', 'reveal', 'resolve'].includes(section.role) || !Number.isInteger(section.lineCount) || section.lineCount < 0 || !Number.isFinite(section.intensity) || section.intensity < 0 || section.intensity > 100 || typeof section.purpose !== 'string') throw new Error('Invalid or duplicate section identity, role or line count');
    sections.add(section.id); keys.add(section.generationKey);
  }
  if (!sections.has(boundary) || !document || !Array.isArray(document.sections) || document.sections.length !== blueprint.sections.length) throw new Error('Invalid narrative boundary or document scope');
  const seenSections = new Set<string>(), lines = new Set<string>();
  for (const section of document.sections) {
    const intent = blueprint.sections.find(intent => intent.id === section.sectionId);
    if (!section || !intent || seenSections.has(section.sectionId) || typeof section.locked !== 'boolean' || !Array.isArray(section.lines) || section.lines.length !== intent.lineCount) throw new Error('Document section references/counts do not match the blueprint');
    seenSections.add(section.sectionId);
    for (const line of section.lines) {
      if (!line || !id(line.id) || lines.has(line.id) || typeof line.text !== 'string' || typeof line.locked !== 'boolean' || !['authored', 'generated', 'unknown'].includes(line.origin) || !Array.isArray(line.lockedRanges)) throw new Error('Invalid or duplicate accepted line');
      lines.add(line.id);
      const ranges = [...line.lockedRanges].sort((a, b) => a[0] - b[0]);
      ranges.forEach((range, index) => { if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger) || range[0] < 0 || range[0] >= range[1] || range[1] > line.text.length || (index > 0 && range[0] < ranges[index - 1][1])) throw new Error('Invalid accepted locked range'); });
    }
  }
  // Optional annotation evidence is validated separately, permitting safe stale-evidence recovery.
  if (document.revision !== fingerprint(document.sections)) throw new Error('Document revision does not match accepted content');
}
function annotationEffect(annotation: SemanticAnnotation, subjects: ReadonlySet<string>): SemanticEffect | undefined {
  const effect = annotation.effect;
  if (!effect) return undefined;
  if (effect.kind === 'assert') return validAssertion(effect.assertion) && subjects.has(effect.assertion.subjectId) ? effect : undefined;
  if (effect.kind === 'goal') return validGoal(effect.goal) ? effect : undefined;
  if (effect.kind === 'motif') return id(effect.motifId) ? effect : undefined;
  return undefined;
}
export const narrativeReducer: NarrativeReducer = {
  derive(blueprint, document, throughSectionId): Resolution<NarrativeState> {
    try { structuralGuard(blueprint, document, throughSectionId); }
    catch (error) { return { status: 'invalid-input', diagnostics: [report('invalid-input', error instanceof Error ? error.message : 'Invalid narrative input')] }; }
    const diagnostics: Diagnostic[] = [];
    const assertions = new Map<string, SemanticAssertion>(), goals = new Map<string, NarrativeGoal>(), motifs = new Set<string>();
    const provenance = new Map<string, Set<string>>(), kinds = new Map<string, string>(), annotations = new Set<string>();
    const subjects = new Set([blueprint.narrative.narratorId, ...blueprint.narrative.subjectIds]);
    const boundary = blueprint.sections.findIndex(section => section.id === throughSectionId);
    function addSource(key: string, kind: string, line: DocumentLine): boolean {
      if (kinds.has(key) && kinds.get(key) !== kind) { diagnostics.push(report('invalid-annotation', 'Semantic identity collides across fact, goal or motif kinds.', line.id)); return false; }
      kinds.set(key, kind);
      const source = provenance.get(key) || new Set<string>(); source.add(line.id); provenance.set(key, source);
      return true;
    }
    for (const intent of blueprint.sections.slice(0, boundary)) {
      const section = document.sections.find(section => section.sectionId === intent.id)!;
      for (const line of section.lines) {
        const protectedLine = section.locked || line.locked;
        if (!Array.isArray(line.annotations)) { diagnostics.push(report('invalid-annotation', 'Malformed optional annotation list was ignored; accepted text is preserved.', line.id, protectedLine)); continue; }
        for (const annotation of line.annotations) {
          if (!annotation || !id(annotation.id) || !['user-confirmed', 'template-declared'].includes(annotation.evidence) || annotations.has(annotation.id)) { diagnostics.push(report('invalid-annotation', 'Malformed, uncertain or duplicate evidence was ignored.', line.id, protectedLine)); continue; }
          annotations.add(annotation.id);
          if (annotation.textFingerprint !== fingerprint(line.text)) { diagnostics.push(report('stale-annotation', 'Annotation no longer matches accepted text and cannot establish narrative facts.', line.id, protectedLine)); continue; }
          const effect = annotationEffect(annotation, subjects);
          if (!effect) { diagnostics.push(report('invalid-annotation', 'Invalid semantic effect or unavailable assertion subject was ignored.', line.id, protectedLine)); continue; }
          const key = effect.kind === 'assert' ? effect.assertion.id : effect.kind === 'goal' ? effect.goal.id : effect.motifId;
          const existing = assertions.get(key);
          if (effect.kind === 'assert' && existing && (existing.subjectId !== effect.assertion.subjectId || existing.predicateId !== effect.assertion.predicateId || existing.timeFrameId !== effect.assertion.timeFrameId || existing.polarity !== effect.assertion.polarity || existing.value !== effect.assertion.value)) { diagnostics.push(report('invalid-annotation', 'Assertion identity was reused for a different fact instance; prior accepted evidence is retained.', line.id, protectedLine)); continue; }
          if (!addSource(key, effect.kind, line)) continue;
          if (effect.kind === 'assert') {
            const incoming = effect.assertion;
            for (const previous of assertions.values()) {
              if (previous.subjectId === incoming.subjectId && previous.predicateId === incoming.predicateId && previous.timeFrameId === incoming.timeFrameId && (previous.value !== incoming.value || previous.polarity !== incoming.polarity)) diagnostics.push(report('narrative-contradiction', 'Accepted assertions differ for the same subject, predicate and time frame; a changed or questioned belief may be intentional.', line.id, protectedLine));
            }
            assertions.set(key, { ...incoming });
          } else if (effect.kind === 'goal') goals.set(key, { ...effect.goal });
          else motifs.add(key);
        }
      }
    }
    const sortedProvenance = Object.fromEntries([...provenance].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, source]) => [key, [...source]]));
    return { status: 'resolved', value: { assertions: [...assertions.values()], goals: [...goals.values()], motifIds: [...motifs], provenance: sortedProvenance }, diagnostics };
  },
};

/** Effects remain candidate-local until annotations enter an accepted document. */
export function applyTemplateEffects(declarations: readonly TemplateEffectDeclaration[], bindings: Readonly<Record<string, string | number | boolean>>, text: string, annotationPrefix: string): Resolution<readonly SemanticAnnotation[]> {
  try {
    if (!Array.isArray(declarations) || !bindings || typeof bindings !== 'object' || Array.isArray(bindings) || typeof text !== 'string' || !id(annotationPrefix)) throw new Error('Invalid effect declarations, bindings, text or annotation prefix');
    const resolve = (binding: TemplateBinding): string | number | boolean => {
      if (!binding || !['literal', 'slot'].includes(binding.kind)) throw new Error('Unknown template binding kind');
      if (binding.kind === 'slot' && !id(binding.slotId)) throw new Error('Invalid template binding slot identity');
      const value = binding.kind === 'literal' ? binding.value : Object.prototype.hasOwnProperty.call(bindings, binding.slotId) ? bindings[binding.slotId] : undefined;
      if (!scalar(value)) throw new Error('Missing or invalid scalar template binding');
      return value;
    };
    const assertionIds = new Set<string>();
    const effects: SemanticEffect[] = declarations.map(declaration => {
      if (!declaration) throw new Error('Missing effect declaration');
      if (declaration.kind === 'assert') {
        const subject = resolve(declaration.subject), timeFrame = resolve(declaration.timeFrame);
        if (!id(subject) || !id(timeFrame)) throw new Error('Assertion subject/time-frame bindings must resolve to stable IDs');
        if (!id(declaration.id)) throw new Error('Invalid assertion declaration identity');
        if (assertionIds.has(declaration.id)) throw new Error('Duplicate assertion declaration identity');
        assertionIds.add(declaration.id);
        const assertion = { id: `${annotationPrefix}:assertion:${declaration.id}`, subjectId: subject, predicateId: declaration.predicateId, value: resolve(declaration.value), polarity: declaration.polarity, timeFrameId: timeFrame };
        if (!validAssertion(assertion)) throw new Error('Invalid assertion declaration');
        return { kind: 'assert', assertion };
      }
      if (declaration.kind === 'goal') { if (!validGoal(declaration.goal)) throw new Error('Invalid goal declaration'); return { kind: 'goal', goal: { ...declaration.goal } }; }
      if (declaration.kind === 'motif') { const motif = resolve(declaration.motif); if (!id(motif)) throw new Error('Motif binding must resolve to a stable ID'); return { kind: 'motif', motifId: motif }; }
      throw new Error('Unknown template effect kind');
    });
    return { status: 'resolved', value: effects.map((effect, i) => ({ id: `${annotationPrefix}:effect:${i + 1}`, evidence: 'template-declared', textFingerprint: fingerprint(text), effect })), diagnostics: [] };
  } catch (error) { return { status: 'invalid-input', diagnostics: [report('invalid-input', error instanceof Error ? error.message : 'Invalid template effects')] }; }
}
