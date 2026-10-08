import { fingerprint, validateSeed } from './randomness';
import type { CandidatePatch, Diagnostic, DocumentApplicator, DocumentLine, DocumentPatch, DocumentSection, LyricCandidate, LyricDocument, PatchResult, ReplacementPolicy, SemanticAnnotation, TextRange, TransformationEdit } from './contracts';

const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const fail = (message: string): never => { throw new Error(message); };
function validPolicy(policy: ReplacementPolicy, operation?: ReplacementPolicy['operation']): boolean {
  return !!policy && ['generate', 'dialect'].includes(policy.operation) && (!operation || policy.operation === operation) && ['preserve', 'replace-explicitly'].includes(policy.authored);
}
function validRange(range: TextRange, text: string, nonempty = true): boolean {
  return Array.isArray(range) && range.length === 2 && range.every(Number.isInteger) && range[0] >= 0 && range[1] <= text.length && (nonempty ? range[0] < range[1] : range[0] <= range[1]);
}
export function isRangeProtected(line: DocumentLine, range: TextRange): boolean {
  return line.lockedRanges.some(([start, end]) => range[0] === range[1] ? range[0] > start && range[0] < end : range[0] < end && range[1] > start);
}
export function isLineProtected(section: DocumentSection, line: DocumentLine, policy: ReplacementPolicy, wholeLine = true): boolean {
  if (!validPolicy(policy)) return true;
  return section.locked || line.locked || (wholeLine && line.lockedRanges.length > 0) || (line.text.trim().length > 0 && (line.origin === 'authored' || line.origin === 'unknown') && policy.authored !== 'replace-explicitly');
}
export function withRevision(sections: readonly DocumentSection[]): LyricDocument {
  return { revision: fingerprint(sections), sections };
}
/** Candidate identity, attempt number and trace are not accepted lyric output. */
export function outputFingerprint(candidate: LyricCandidate): string {
  return fingerprint(candidate.lines.map(({ slotId, targetLineId, text, annotations }) => ({ slotId, targetLineId, text, annotations })));
}
function validateAnnotations(annotations: readonly SemanticAnnotation[], text: string): void {
  if (!Array.isArray(annotations)) fail('Annotations must be an array');
  const ids = new Set<string>();
  for (const annotation of annotations) {
    if (!annotation || !id(annotation.id) || ids.has(annotation.id) || !['user-confirmed', 'template-declared'].includes(annotation.evidence) || annotation.textFingerprint !== fingerprint(text)) fail('Invalid or unanchored semantic annotation');
    ids.add(annotation.id);
    const effect = annotation.effect;
    if (!effect) fail('Missing semantic effect');
    if (effect.kind === 'assert') {
      const assertion = effect.assertion;
      if (!assertion || ![assertion.id, assertion.subjectId, assertion.predicateId, assertion.timeFrameId].every(id) || !['positive', 'negative'].includes(assertion.polarity) || !['string', 'number', 'boolean'].includes(typeof assertion.value) || (typeof assertion.value === 'number' && !Number.isFinite(assertion.value))) fail('Invalid assertion effect');
    } else if (effect.kind === 'goal') {
      if (!effect.goal || !id(effect.goal.id) || typeof effect.goal.description !== 'string' || !['open', 'developed', 'challenged', 'resolved'].includes(effect.goal.status)) fail('Invalid goal effect');
    } else if (effect.kind === 'motif') {
      if (!id(effect.motifId)) fail('Invalid motif effect');
    } else fail('Unknown semantic effect');
  }
}
export function validateDocument(document: LyricDocument): void {
  if (!document || !Array.isArray(document.sections)) fail('Invalid document sections');
  const sectionIds = new Set<string>(), lineIds = new Set<string>();
  for (const section of document.sections) {
    if (!section || !id(section.sectionId) || sectionIds.has(section.sectionId) || typeof section.locked !== 'boolean' || !Array.isArray(section.lines)) fail('Invalid or duplicate document section');
    sectionIds.add(section.sectionId);
    for (const line of section.lines) {
      if (!line || !id(line.id) || lineIds.has(line.id) || typeof line.text !== 'string' || typeof line.locked !== 'boolean' || !['authored', 'generated', 'unknown'].includes(line.origin) || !Array.isArray(line.lockedRanges) || (line.recipeId !== undefined && !id(line.recipeId))) fail('Invalid or duplicate document line');
      lineIds.add(line.id);
      const ordered = [...line.lockedRanges].sort((a, b) => a[0] - b[0]);
      ordered.forEach((range, index) => { if (!validRange(range, line.text) || (index > 0 && range[0] < ordered[index - 1][1])) fail('Invalid or overlapping locked range'); });
      validateAnnotations(line.annotations, line.text);
    }
  }
  if (document.revision !== fingerprint(document.sections)) fail('Document revision does not match its content');
}
function validateCandidate(patch: CandidatePatch, document: LyricDocument): void {
  const candidate = patch.candidate, recipe = patch.recipe;
  if (!candidate || !id(candidate.id) || !Number.isInteger(candidate.ordinal) || candidate.ordinal < 0 || !Array.isArray(candidate.lines) || !candidate.lines.length) fail('Invalid candidate identity or lines');
  const slots = new Set<string>(), targets = new Set<string>();
  for (const line of candidate.lines) {
    if (!line || !id(line.slotId) || slots.has(line.slotId) || !id(line.targetLineId) || targets.has(line.targetLineId) || typeof line.text !== 'string') fail('Invalid or duplicate candidate mapping');
    slots.add(line.slotId); targets.add(line.targetLineId);
    validateAnnotations(line.annotations, line.text);
  }
  if (!recipe || !id(recipe.id) || !recipe.inputs || !recipe.profile || recipe.profile.contractVersion !== 1 || !Array.isArray(recipe.profile.packs) || !recipe.profile.algorithms || typeof recipe.profile.algorithms !== 'object') fail('Invalid replay recipe/profile');
  validateSeed(recipe.rootSeed);
  if (!Number.isInteger(recipe.variation) || recipe.variation < 0 || recipe.candidateOrdinal !== candidate.ordinal || !id(recipe.generationKey)) fail('Invalid recipe attempt identity');
  for (const reference of Object.values(recipe.profile.algorithms)) if (!reference || !id(reference.id) || !id(reference.version)) fail('Invalid algorithm reference');
  const packs = new Set<string>();
  for (const pack of recipe.profile.packs) { if (!pack || !id(pack.id) || packs.has(pack.id) || !id(pack.version) || !id(pack.contentHash)) fail('Invalid pack reference'); packs.add(pack.id); }
  const inputs = recipe.inputs;
  validateDocument(inputs.baselineDocument);
  const blueprintSection = inputs.blueprint?.sections?.find(section => section.id === patch.sectionId);
  if (!blueprintSection || recipe.rootSeed !== inputs.blueprint.rootSeed || recipe.generationKey !== blueprintSection.generationKey || inputs.sectionId !== patch.sectionId || !Array.isArray(inputs.targetLineIds) || new Set(inputs.targetLineIds).size !== inputs.targetLineIds.length || inputs.targetLineIds.some(target => !id(target) || !inputs.baselineDocument.sections.find(section => section.sectionId === patch.sectionId)?.lines.some(line => line.id === target)) || candidate.lines.some(line => !inputs.targetLineIds.includes(line.targetLineId))) fail('Recipe scope/seed/key does not match candidate');
  if (!validPolicy(inputs.replacementPolicy, 'generate') || fingerprint(inputs.replacementPolicy) !== fingerprint(patch.replacementPolicy)) fail('Recipe replacement policy does not match patch');
  if (fingerprint(inputs.baselineDocument) !== fingerprint(document) || recipe.inputFingerprint !== fingerprint(inputs) || recipe.outputFingerprint !== outputFingerprint(candidate)) fail('Recipe input/output fingerprints do not match');
  if (!inputs.evaluationPolicy || !id(inputs.evaluationPolicy.id) || !id(inputs.evaluationPolicy.version) || !Array.isArray(inputs.evaluationPolicy.hardRuleIds) || !inputs.evaluationPolicy.scoreWeights || Object.values(inputs.evaluationPolicy.scoreWeights).some(weight => !Number.isFinite(weight) || weight < 0)) fail('Invalid recorded evaluation policy');
  if (!inputs.budget || !Number.isInteger(inputs.budget.maxAttempts) || inputs.budget.maxAttempts < 1 || !Number.isInteger(inputs.budget.maxCandidates) || inputs.budget.maxCandidates < 1 || inputs.budget.maxCandidates > inputs.budget.maxAttempts || recipe.candidateOrdinal >= inputs.budget.maxAttempts) fail('Invalid recorded search budget');
}
const result = (status: 'invalid-patch' | 'stale' | 'protected', message: string, lineIds: readonly string[] = []): PatchResult => ({ status, diagnostics: [{ ruleId: status, severity: 'error', origin: status === 'protected' ? 'protected' : 'context', lineIds, message } satisfies Diagnostic] });
function applyCandidate(document: LyricDocument, patch: CandidatePatch): PatchResult {
  if (!validPolicy(patch.replacementPolicy, 'generate')) return result('invalid-patch', 'Candidate patches require a generation replacement policy');
  validateCandidate(patch, document);
  const section = document.sections.find(section => section.sectionId === patch.sectionId);
  if (!section) return result('invalid-patch', 'Candidate section is unavailable');
  for (const update of patch.candidate.lines) {
    const line = section.lines.find(line => line.id === update.targetLineId);
    if (!line) return result('invalid-patch', 'Candidate line is outside its section', [update.targetLineId]);
    if (isLineProtected(section, line, patch.replacementPolicy)) return result('protected', 'Candidate cannot overwrite protected content', [line.id]);
  }
  const updates = new Map(patch.candidate.lines.map(line => [line.targetLineId, line]));
  const next = document.sections.map(current => current !== section ? current : {
    ...current,
    lines: current.lines.map(line => {
      const update = updates.get(line.id);
      if (!update) return line;
      return { ...line, text: update.text, origin: 'generated' as const, annotations: update.annotations, recipeId: patch.recipe.id };
    }),
  });
  return { status: 'applied', document: withRevision(next) };
}
function applyTransformation(document: LyricDocument, patch: Extract<DocumentPatch, { kind: 'transformation' }>): PatchResult {
  if (!validPolicy(patch.replacementPolicy, 'dialect') || !patch.preview || !Array.isArray(patch.preview.edits) || !Array.isArray(patch.preview.diagnostics) || !Array.isArray(patch.preview.pronunciationHints)) return result('invalid-patch', 'Invalid transformation preview/policy');
  if (patch.preview.diagnostics.some(issue => issue.severity === 'error')) return result('invalid-patch', 'Transformation preview contains errors');
  const grouped = new Map<string, TransformationEdit[]>();
  for (const edit of patch.preview.edits) {
    const section = document.sections.find(section => section.lines.some(line => line.id === edit.lineId));
    const line = section?.lines.find(line => line.id === edit.lineId);
    if (!line || !section || !id(edit.ruleId) || typeof edit.before !== 'string' || typeof edit.after !== 'string' || !validRange(edit.range, line.text, false) || line.text.slice(edit.range[0], edit.range[1]) !== edit.before) return result('invalid-patch', 'Transformation range/before text or rule ID is invalid', [edit.lineId]);
    if (isLineProtected(section, line, patch.replacementPolicy, false) || isRangeProtected(line, edit.range)) return result('protected', 'Transformation overlaps protected content', [line.id]);
    const edits = grouped.get(line.id) || []; edits.push(edit); grouped.set(line.id, edits);
  }
  for (const [lineId, edits] of grouped) {
    edits.sort((a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]);
    for (let i = 1; i < edits.length; i++) if (edits[i].range[0] < edits[i - 1].range[1] || edits[i].range[0] === edits[i - 1].range[0]) return result('invalid-patch', 'Transformation edits overlap', [lineId]);
  }
  if (!grouped.size) return { status: 'applied', document };
  const next = document.sections.map(section => {
    if (!section.lines.some(line => grouped.has(line.id))) return section;
    return { ...section, lines: section.lines.map(line => {
      const edits = grouped.get(line.id);
      if (!edits) return line;
      let text = line.text;
      for (const edit of [...edits].reverse()) text = text.slice(0, edit.range[0]) + edit.after + text.slice(edit.range[1]);
      if (text === line.text) return line;
      const lockedRanges = line.lockedRanges.map(([start, end]): TextRange => {
        const shift = edits.filter(edit => edit.range[1] <= start).reduce((sum, edit) => sum + edit.after.length - edit.before.length, 0);
        return [start + shift, end + shift];
      });
      return { ...line, text, lockedRanges, annotations: line.annotations.filter(annotation => annotation.textFingerprint === fingerprint(text)) };
    }) };
  });
  return { status: 'applied', document: withRevision(next) };
}
export const documentApplicator: DocumentApplicator = {
  apply(document, patch) {
    try {
      validateDocument(document);
      if (!patch || !['candidate', 'transformation'].includes(patch.kind)) return result('invalid-patch', 'Unknown document patch');
      const expected = patch.kind === 'candidate' ? patch.expectedRevision : patch.preview?.expectedRevision;
      if (typeof expected !== 'string') return result('invalid-patch', 'Patch requires an expected revision');
      if (expected !== document.revision) return result('stale', 'The document changed after this patch was prepared');
      return patch.kind === 'candidate' ? applyCandidate(document, patch) : applyTransformation(document, patch);
    } catch (error) { return result('invalid-patch', error instanceof Error ? error.message : 'Invalid patch'); }
  },
};
