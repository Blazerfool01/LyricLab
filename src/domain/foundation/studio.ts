/** Pure workspace operations. Browser persistence and React live outside this boundary. */
import type { Project, PromptFormat } from '../types';
import type { Diagnostic, GenerationRequest, HookArchetype, LyricCandidate, ProjectEnvelope, ReplayRecipe, ReplacementPolicy, SectionRole, TransformationPreview } from './contracts';
import { toEnvelope, toEditorProject } from './persistence';
import { foundationCoordinator, narrativeCatalog, narrativeProfile } from './narrative-generation';
import { defaultEvaluationPolicy, makeRecipe } from './generation';
import { documentApplicator, isLineProtected, withRevision } from './editing';
import { dialectTransformer } from './dialect';
import { textAnalyzer } from './analysis';
import { constraintEvaluator } from './constraints';
import { styleResolver, styleCompiler } from './style';
import { fingerprint, namedRandom } from './randomness';

export type StudioResult = { status: 'applied'; project: Project; diagnostics: readonly Diagnostic[] } | { status: 'exhausted' | 'invalid-input' | 'missing-dependency' | 'stale' | 'protected' | 'invalid-patch'; diagnostics: readonly Diagnostic[] };
const problem = (ruleId: string, message: string): Diagnostic => ({ ruleId, message, severity: 'error', origin: 'context', lineIds: [] });
const failed = (error: unknown): StudioResult => ({ status: 'invalid-input', diagnostics: [problem('invalid-input', error instanceof Error ? error.message : 'Invalid workspace operation')] });
const parentFingerprint = (envelope: ProjectEnvelope) => fingerprint({ blueprint: envelope.blueprint, document: envelope.document, variations: envelope.variations });
function requestFor(envelope: ProjectEnvelope, sectionId: string, variation: number, allowEmpty = false): GenerationRequest {
  const section = envelope.document.sections.find(section => section.sectionId === sectionId);
  if (!section || (!allowEmpty && !section.lines.length)) throw new Error('The section has no lines to generate.');
  return { blueprint: envelope.blueprint, document: envelope.document, sectionId, targetLineIds: section.lines.map(line => line.id), variation, profile: narrativeProfile, replacementPolicy: { operation: 'generate', authored: 'preserve' }, evaluationPolicy: defaultEvaluationPolicy, budget: { maxAttempts: 32, maxCandidates: 3 } };
}
function accepted(envelope: ProjectEnvelope, request: GenerationRequest, candidate: LyricCandidate, recipe: ReplayRecipe): StudioResult {
  const applied = documentApplicator.apply(envelope.document, { kind: 'candidate', expectedRevision: request.document.revision, sectionId: request.sectionId, replacementPolicy: request.replacementPolicy, candidate, recipe });
  if (applied.status !== 'applied') return applied;
  if (request.variation >= Number.MAX_SAFE_INTEGER) throw new Error('The variation counter is exhausted. Choose a new generation key before continuing.');
  return { status: 'applied', project: toEditorProject({ ...envelope, document: applied.document, recipes: [...envelope.recipes, recipe], variations: { ...envelope.variations, [recipe.generationKey]: request.variation + 1 } }), diagnostics: [] };
}
export function regenerateProject(project: Project, sectionId: string): StudioResult {
  try {
    const envelope = toEnvelope(project), intent = envelope.blueprint.sections.find(section => section.id === sectionId);
    if (!intent) throw new Error('Requested section is unavailable.');
    const request = requestFor(envelope, sectionId, Object.prototype.hasOwnProperty.call(envelope.variations, intent.generationKey) ? envelope.variations[intent.generationKey] : 0);
    const result = foundationCoordinator.generate(request, narrativeCatalog);
    if (result.status !== 'ready') return result;
    const selected = result.candidates.find(entry => entry.candidate.id === result.selectedCandidateId)!;
    const applied = accepted(envelope, request, selected.candidate, makeRecipe(request, selected.candidate, narrativeCatalog));
    return applied.status === 'applied' ? { ...applied, diagnostics: selected.evaluation.diagnostics } : applied;
  } catch (error) { return failed(error); }
}
export interface HookDraft { readonly parentFingerprint: string; readonly baseline: ProjectEnvelope; readonly request: GenerationRequest; readonly candidate: LyricCandidate; readonly recipe: ReplayRecipe; }
export interface HookPreview { readonly archetype: HookArchetype; readonly label: string; readonly lines: readonly { id: string; text: string }[]; readonly diagnostics: readonly Diagnostic[]; readonly draft?: HookDraft; }
export function previewHooks(project: Project, variation: number): readonly HookPreview[] {
  return (['title-drop', 'refrain', 'statement'] as const).map((archetype, index) => {
    const label = ['Title drop', 'Refrain', 'Central claim'][index];
    try {
      const source = toEnvelope(project);
      const identity = fingerprint({ projectId: source.id, archetype, variation, existingSections: source.blueprint.sections.map(section => section.id) });
      const sectionId = `hook:${identity}`;
      const intent = { id: sectionId, name: 'Chorus', generationKey: sectionId, type: 'chorus' as const, role: 'resolve' as const, purpose: 'State the central claim', lineCount: 4, intensity: 75, hookArchetype: archetype, constraints: { rhymeScheme: 'ABAB', syllableRange: [8, 12] as const, deliveryId: 'delivery:melodic' } };
      const baseline = { ...source, blueprint: { ...source.blueprint, sections: [...source.blueprint.sections, intent] }, document: withRevision([...source.document.sections, { sectionId, locked: false, lines: Array.from({ length: 4 }, (_, i) => ({ id: `${sectionId}:line:${i + 1}`, text: '', origin: 'generated' as const, locked: false, lockedRanges: [], annotations: [] })) }]) };
      const request = requestFor(baseline, sectionId, variation), result = foundationCoordinator.generate(request, narrativeCatalog);
      if (result.status !== 'ready') return { archetype, label, lines: [], diagnostics: result.diagnostics };
      const selected = result.candidates.find(entry => entry.candidate.id === result.selectedCandidateId)!;
      return { archetype, label, lines: selected.candidate.lines.map(line => ({ id: line.targetLineId, text: line.text })), diagnostics: selected.evaluation.diagnostics, draft: { parentFingerprint: parentFingerprint(source), baseline, request, candidate: selected.candidate, recipe: makeRecipe(request, selected.candidate, narrativeCatalog) } };
    } catch (error) { return { archetype, label, lines: [], diagnostics: failed(error).diagnostics }; }
  });
}
export function acceptHook(project: Project, preview: HookPreview): StudioResult {
  try {
    if (!preview.draft) return { status: 'exhausted', diagnostics: preview.diagnostics };
    const source = toEnvelope(project), draft = preview.draft;
    if (parentFingerprint(source) !== draft.parentFingerprint) return { status: 'stale', diagnostics: [problem('stale', 'The song changed after this hook preview. Generate a fresh preview.')] };
    const applied = accepted({ ...draft.baseline, recipes: source.recipes, ignoredWarnings: source.ignoredWarnings, updatedAt: source.updatedAt }, draft.request, draft.candidate, draft.recipe);
    if (applied.status !== 'applied') return applied;
    const envelope = toEnvelope(applied.project);
    return { ...applied, project: toEditorProject({ ...envelope, variations: { ...envelope.variations, 'hook-lab': draft.request.variation + 1 } }) };
  } catch (error) { return failed(error); }
}
export interface DialectDraft { readonly preview: TransformationPreview; readonly lines: readonly { id: string; text: string }[]; readonly parentFingerprint: string; readonly policy: ReplacementPolicy; }
export function previewStudioDialect(project: Project, sectionId: string, replaceAuthored = false): DialectDraft {
  const policy: ReplacementPolicy = { operation: 'dialect', authored: replaceAuthored ? 'replace-explicitly' : 'preserve' };
  try {
    const source = toEnvelope(project), section = source.document.sections.find(section => section.sectionId === sectionId), options = source.blueprint.language.dialect;
    if (!section || !options) throw new Error('Select a section and dialect to preview.');
    const pack = narrativeCatalog.dialects.get(options.packId);
    if (!pack) throw new Error('The requested dialect pack is unavailable.');
    const all = dialectTransformer.preview(source.document, pack, options, policy), ids = new Set(section.lines.map(line => line.id));
    const preview = { ...all, edits: all.edits.filter(edit => ids.has(edit.lineId)) };
    const lines = section.lines.map(line => {
      let text = line.text;
      for (const edit of preview.edits.filter(edit => edit.lineId === line.id).sort((a, b) => b.range[0] - a.range[0])) text = text.slice(0, edit.range[0]) + edit.after + text.slice(edit.range[1]);
      return { id: line.id, text };
    });
    return { preview, lines, parentFingerprint: parentFingerprint(source), policy };
  } catch (error) { return { policy, parentFingerprint: '', lines: [], preview: { expectedRevision: '', edits: [], pronunciationHints: [], diagnostics: failed(error).diagnostics } }; }
}
export function applyStudioDialect(project: Project, draft: DialectDraft): StudioResult {
  try {
    const source = toEnvelope(project);
    if (parentFingerprint(source) !== draft.parentFingerprint) return { status: 'stale', diagnostics: [problem('stale', 'The song changed after this dialect preview. Preview it again.')] };
    const applied = documentApplicator.apply(source.document, { kind: 'transformation', replacementPolicy: draft.policy, preview: draft.preview });
    return applied.status === 'applied' ? { status: 'applied', project: toEditorProject({ ...source, document: applied.document }), diagnostics: draft.preview.diagnostics } : applied;
  } catch (error) { return failed(error); }
}
export function duplicateStudioSection(project: Project, sourceId: string, newSectionId: string, newLineIds: readonly string[]): Project {
  const source = toEnvelope(project), intent = source.blueprint.sections.find(section => section.id === sourceId), section = source.document.sections.find(section => section.sectionId === sourceId);
  const existingLines = new Set(source.document.sections.flatMap(section => section.lines.map(line => line.id)));
  if (!intent || !section || !newSectionId.trim() || newLineIds.length !== section.lines.length || new Set(newLineIds).size !== newLineIds.length || newLineIds.some(id => !id.trim() || existingLines.has(id)) || source.blueprint.sections.some(section => section.id === newSectionId || section.generationKey === newSectionId)) throw new Error('Invalid duplicate section scope.');
  const copyIntent = { ...intent, id: newSectionId, name: `${intent.name || 'Section'} (copy)`, generationKey: newSectionId };
  const copy = { ...section, sectionId: newSectionId, lines: section.lines.map((line, index) => ({ ...line, id: newLineIds[index], annotations: line.annotations.map(annotation => ({ ...annotation, id: `${newLineIds[index]}:copy:${annotation.id}` })) })) };
  return toEditorProject({ ...source, blueprint: { ...source.blueprint, sections: source.blueprint.sections.flatMap(section => section.id === sourceId ? [section, copyIntent] : [section]) }, document: withRevision(source.document.sections.flatMap(section => section.sectionId === sourceId ? [section, copy] : [section])) });
}
export function setStudioRole(project: Project, sectionId: string, role: SectionRole): Project {
  const source = toEnvelope(project);
  return toEditorProject({ ...source, blueprint: { ...source.blueprint, sections: source.blueprint.sections.map(section => section.id === sectionId ? { ...section, role } : section) } });
}
export function compileStudioStyle(project: Project, format: PromptFormat): string {
  try {
    const source = toEnvelope(project), result = styleResolver.resolve(source.blueprint.style, narrativeCatalog, namedRandom(source.blueprint.rootSeed, ['style']));
    if (result.status !== 'resolved') return result.diagnostics.map(issue => issue.message).join('\n');
    const options = source.blueprint.language.dialect, tags = options ? narrativeCatalog.dialects.get(options.packId)?.styleTags || [] : [];
    return styleCompiler.compile(result.value, format) + (tags.length ? `\n\nRegional guidance: ${tags.join(', ')}.` : '');
  } catch (error) { return failed(error).diagnostics.map(issue => issue.message).join('\n'); }
}
export function analyzeStudioSection(project: Project, sectionId: string) {
  try {
    const source = toEnvelope(project), section = source.blueprint.sections.find(section => section.id === sectionId)!, accepted = source.document.sections.find(section => section.sectionId === sectionId)!;
    if (!section || !accepted) throw new Error('Section is unavailable.');
    const lines = accepted.lines.map(line => ({ lineId: line.id, sectionId, text: line.text, protected: isLineProtected(accepted, line, { operation: 'generate', authored: 'preserve' }), origin: 'context' as const }));
    const measured = textAnalyzer.analyze(lines, narrativeCatalog.pronunciations);
    const context = { request: requestFor(source, sectionId, 0, true), section, language: { intent: source.blueprint.language, eligibleVocabularyIds: [], eligibleTemplateIds: [] }, narrative: { assertions: [], goals: [], motifIds: [], provenance: {} }, neighbors: lines, catalog: narrativeCatalog };
    const warnings = constraintEvaluator.evaluate(measured, context).map(issue => ({ id: `warning:${fingerprint(issue)}`, text: issue.message, lineId: issue.lineIds[0] || '' }));
    const keys = measured.lines.map(line => line.endRhymeKey || ''), labels: string[] = [];
    const scheme = measured.lines.map((line, index) => {
      if (!line.endRhymeKey) return '?';
      const match = measured.rhymes.find(relation => relation.lineIds[1] === line.lineId && relation.kind !== 'unknown');
      const previous = match ? measured.lines.findIndex(line => line.lineId === match.lineIds[0]) : -1;
      const label = previous >= 0 ? labels[previous] : String.fromCharCode(65 + new Set(labels.filter(label => label !== '?')).size);
      labels[index] = label; return label;
    }).join('');
    const range = section.constraints.syllableRange || narrativeCatalog.choices.get(section.constraints.deliveryId || '')?.range || [8, 12] as const;
    return { counts: measured.lines.map(line => line.syllables), confidence: measured.lines.map(line => line.confidence), keys, scheme, warnings, range };
  } catch (error) { return { counts: project.structure.find(section => section.id === sectionId)?.lines.map(() => 0) || [], confidence: project.structure.find(section => section.id === sectionId)?.lines.map(() => 'unknown' as const) || [], keys: [] as string[], scheme: '', range: [8, 12] as const, warnings: failed(error).diagnostics.map(issue => ({ id: `warning:${fingerprint(issue)}`, text: issue.message, lineId: '' })) }; }
}
