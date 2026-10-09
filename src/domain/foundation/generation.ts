import { textAnalyzer } from './analysis';
import { catalog as baseCatalog, generationCatalog, legacyGenerationCatalog, freeze } from './catalogs';
import { candidateContextLines, candidateEvaluator, supportedRuleIds } from './constraints';
import { isLineProtected, outputFingerprint, validateDocument, withRevision } from './editing';
import { dialectTransformer } from './dialect';
import { styleResolver } from './style';
import { fingerprint, namedRandom, validateSeed } from './randomness';
import type { CandidateGenerator, CatalogSnapshot, Diagnostic, EvaluationPolicy, ExecutionProfile, GenerationContext, GenerationCoordinator, GenerationRequest, GenerationResult, LanguageResolver, LyricCandidate, NarrativeReducer, ReplayRecipe, Resolution, SectionIntent, SectionPlan, StructurePlanner } from './contracts';

export const MAX_ATTEMPTS = 128;
export const MAX_CANDIDATES = 16;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const identifier = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const issue = (ruleId: string, message: string): Diagnostic => ({ ruleId, message, severity: 'error', origin: 'context', lineIds: [] });
const failure = (status: 'invalid-input' | 'missing-dependency' | 'exhausted', message: string): GenerationResult => ({ status, diagnostics: [issue(status, message)] });
const viewNames = ['choices', 'genres', 'traits', 'vocabulary', 'templates', 'pronunciations', 'dialects'] as const;
export function catalogFingerprint(snapshot: CatalogSnapshot): string {
  return fingerprint(Object.fromEntries(viewNames.map(name => {
    const entries = snapshot[name].all();
    if (!Array.isArray(entries) || entries.some(entry => !identifier(entry.id)) || new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Malformed catalogue view');
    for (const entry of entries) if (fingerprint(snapshot[name].get(entry.id)) !== fingerprint(entry)) throw new Error('Catalogue index disagrees with its content');
    return [name, [...entries].sort((a, b) => compare(a.id, b.id))];
  })));
}
const algorithms = freeze({
  protection: { id: 'shared-protected-application', version: '1.0.0' },
  style: { id: 'resolved-style-validation', version: '1.0.0' },
  randomness: { id: 'named-mulberry32', version: '1.0.0' },
  language: { id: 'catalog-language-resolution', version: '1.0.0' },
  planning: { id: 'legacy-section-planning', version: '1.0.0' },
  composition: { id: 'legacy-pattern-composition', version: '1.0.0' },
  analysis: { id: 'foundation-text-analysis', version: '1.0.0' },
  evaluation: { id: 'foundation-candidate-evaluation', version: '1.0.0' },
  transformation: { id: 'controlled-dialect', version: '1.0.0' },
  selection: { id: 'bounded-candidate-search', version: '1.0.0' },
  narrative: { id: 'empty-narrative-context', version: '1.0.0' },
});
const bundledProfile = (snapshot: CatalogSnapshot): ExecutionProfile => freeze({ contractVersion: 1, algorithms, packs: [...snapshot.packs].sort((a, b) => compare(a.id, b.id)) });
export const defaultProfile: ExecutionProfile = bundledProfile(generationCatalog);
const legacyGenerationProfile = bundledProfile(legacyGenerationCatalog);
const baseProfile = bundledProfile(baseCatalog);
export const defaultEvaluationPolicy: EvaluationPolicy = freeze({ id: 'offline-draft', version: '1.0.0', hardRuleIds: ['avoided', 'cliche'], scoreWeights: { cadence: 1, rhyme: 1, repetition: 1, perspective: 1 } });
/** Only bundled snapshots may select default refs; hashes from caller input are never registered. */
export function createDefaultProfile(snapshot: CatalogSnapshot): ExecutionProfile {
  for (const supported of [generationCatalog, legacyGenerationCatalog, baseCatalog]) if (fingerprint([...snapshot.packs].sort((a, b) => compare(a.id, b.id))) === fingerprint([...supported.packs].sort((a, b) => compare(a.id, b.id))) && catalogFingerprint(snapshot) === catalogFingerprint(supported)) return bundledProfile(supported);
  throw new Error('No supported execution profile for this catalogue');
}

function weightedReferences(values: readonly { id: string; weight: number }[]): boolean {
  return Array.isArray(values) && values.every(value => value && identifier(value.id) && Number.isFinite(value.weight) && value.weight > 0) && new Set(values.map(value => value.id)).size === values.length;
}
export const languageResolver: LanguageResolver = {
  resolve(intent, snapshot) {
    if (!intent || !weightedReferences(intent.themeIds) || !intent.themeIds.length || !['first', 'second', 'third'].includes(intent.perspective) || !identifier(intent.registerId) || typeof intent.motif !== 'string' || !Array.isArray(intent.toneIds) || !Array.isArray(intent.preferredTerms) || !Array.isArray(intent.avoidedTerms) || [...intent.toneIds, ...intent.preferredTerms, ...intent.avoidedTerms].some(term => typeof term !== 'string')) return { status: 'invalid-input', diagnostics: [issue('invalid-input', 'Language intent requires valid themes, perspective, register and vocabulary lists.')] };
    for (const theme of intent.themeIds) if (snapshot.choices.get(theme.id)?.category !== 'theme') return { status: 'missing-dependency', diagnostics: [issue('missing-dependency', `Theme “${theme.id}” is unavailable.`)] };
    if (snapshot.choices.get(intent.registerId)?.category !== 'language') return { status: 'missing-dependency', diagnostics: [issue('missing-dependency', `Language register “${intent.registerId}” is unavailable.`)] };
    for (const tone of intent.toneIds) if (!['mood', 'tone'].includes(snapshot.choices.get(tone)?.category || '')) return { status: 'missing-dependency', diagnostics: [issue('missing-dependency', `Tone “${tone}” is unavailable.`)] };
    const themes = new Set(intent.themeIds.map(theme => theme.id));
    const vocabulary = snapshot.vocabulary.all().filter(entry => entry.themeIds.some(theme => themes.has(theme)));
    const templates = snapshot.templates.all().filter(template => template.id.startsWith('legacy:') || [...themes].some(theme => template.id.startsWith(`${theme}:verse:`)));
    return { status: 'resolved', value: { intent, eligibleVocabularyIds: vocabulary.map(entry => entry.id).sort(compare), eligibleTemplateIds: templates.map(entry => entry.id).sort(compare) }, diagnostics: [] };
  },
};
function templatesFor(context: GenerationContext): readonly string[] {
  const section = context.section;
  return context.language.eligibleTemplateIds.filter(id => {
    const template = context.catalog.templates.get(id)!;
    if (section.type === 'chorus') return template.archetypes.includes(section.hookArchetype || 'title-drop');
    if (section.type === 'bridge') return id.startsWith('legacy:bridge:');
    return id.includes(':verse:') && template.roles.includes(section.role);
  });
}
export const structurePlanner: StructurePlanner = {
  plan(context): Resolution<SectionPlan> {
    const section = context.request.document.sections.find(section => section.sectionId === context.section.id);
    if (!section) return { status: 'invalid-input', diagnostics: [issue('invalid-input', 'Document section is unavailable.')] };
    const templateIds = templatesFor(context);
    if (!templateIds.length) return { status: 'missing-dependency', diagnostics: [issue('missing-dependency', 'No existing template supports this section role/archetype.')] };
    const constraints = context.section.constraints;
    const delivery = constraints.deliveryId ? context.catalog.choices.get(constraints.deliveryId) : undefined;
    if (constraints.deliveryId && (!delivery || delivery.category !== 'delivery')) return { status: 'missing-dependency', diagnostics: [issue('missing-dependency', 'Requested delivery is unavailable.')] };
    const effective = { ...constraints, ...(constraints.syllableRange ? {} : delivery?.range ? { syllableRange: delivery.range } : {}) };
    const targets = new Set(context.request.targetLineIds);
    return { status: 'resolved', value: { sectionId: section.sectionId, protectedLines: section.lines.filter(line => isLineProtected(section, line, context.request.replacementPolicy)), editableSlots: section.lines.filter(line => targets.has(line.id) && !isLineProtected(section, line, context.request.replacementPolicy)).map(line => ({ slotId: `slot:${line.id}`, targetLineId: line.id, role: context.section.role, templateIds, constraints: effective })) }, diagnostics: [] };
  },
};
function applyPerspective(text: string, perspective: 'first' | 'second' | 'third'): string {
  if (perspective === 'first') return text;
  const second = perspective === 'second';
  return text.replace(/\bI am\b/g, second ? 'You are' : 'They are').replace(/\bI\b/g, second ? 'You' : 'They').replace(/\bmy\b/g, second ? 'your' : 'their').replace(/\bme\b/g, second ? 'you' : 'them');
}
export const legacyCandidateGenerator: CandidateGenerator = {
  compose(context, plan, random, ordinal) {
    const themes = [...context.language.intent.themeIds].sort((a, b) => b.weight - a.weight || compare(a.id, b.id));
    const theme = themes[0].id;
    const objects = context.language.eligibleVocabularyIds.map(id => context.catalog.vocabulary.get(id)!).filter(entry => entry.kind === 'object' && entry.themeIds.includes(theme));
    const object = objects[0];
    const motif = context.language.intent.motif || object?.text || '';
    const claim = context.catalog.choices.get(theme)?.claim;
    const vocabularyIds = new Set<string>(), templateIds: string[] = [];
    const lines = plan.editableSlots.map(slot => {
      const templateId = slot.templateIds[Math.floor(random.next() * slot.templateIds.length)];
      const template = context.catalog.templates.get(templateId);
      if (!template) throw new Error('Selected template is unavailable');
      templateIds.push(templateId);
      let text = template.pattern.replace(/\{(title|motif|object|claim)\}/g, (_, name: string) => {
        if (name === 'title') return context.request.blueprint.title || 'A new beginning';
        if (name === 'motif') return motif;
        if (name === 'object') { if (!object) throw new Error('Template object is unavailable'); vocabularyIds.add(object.id); return object.text; }
        if (typeof claim !== 'string') throw new Error('Template claim metadata is unavailable');
        return claim;
      });
      if (/\{[^{}]+\}/.test(text)) throw new Error('Unsupported template binding');
      text = applyPerspective(text, context.language.intent.perspective);
      const delivery = slot.constraints.deliveryId ? context.catalog.choices.get(slot.constraints.deliveryId)?.label : undefined;
      if (delivery === 'Short / clipped' || delivery === 'Dragged / spacious') { const parts = text.split(' '); text = parts.slice(Math.max(0, parts.length - 6)).join(' '); text = text[0]?.toUpperCase() + text.slice(1); }
      if (delivery === 'Dense rhythmic' || delivery === 'Double-time') text += `, with the ${motif} beside me`;
      return { slotId: slot.slotId, targetLineId: slot.targetLineId, text, annotations: [] };
    });
    const identity = fingerprint({ generationKey: context.section.generationKey, variation: context.request.variation, ordinal });
    return { id: `candidate:${identity}`, ordinal, lines, trace: { templateIds, vocabularyIds: [...vocabularyIds].sort(compare) } };
  },
};

function validateSection(section: SectionIntent): void {
  if (!section || !identifier(section.id) || !identifier(section.generationKey) || !['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'custom'].includes(section.type) || !['establish', 'develop', 'challenge', 'reveal', 'resolve'].includes(section.role) || typeof section.purpose !== 'string' || (section.name !== undefined && typeof section.name !== 'string') || !Number.isInteger(section.lineCount) || section.lineCount < 0 || section.lineCount > 100 || !Number.isFinite(section.intensity) || section.intensity < 0 || section.intensity > 100 || !section.constraints) throw new Error('Invalid section identity, role, count, intensity or constraints');
  const constraints = section.constraints;
  if (constraints.syllableRange && (constraints.syllableRange.length !== 2 || !constraints.syllableRange.every(value => Number.isFinite(value) && value > 0) || constraints.syllableRange[0] > constraints.syllableRange[1])) throw new Error('Invalid section syllable range');
  if (constraints.rhymeScheme !== undefined && (typeof constraints.rhymeScheme !== 'string' || !/^[A-Z]*$/.test(constraints.rhymeScheme))) throw new Error('Rhyme scheme must use uppercase letter labels');
  if (constraints.repetitionPreference !== undefined && !['low', 'balanced', 'high'].includes(constraints.repetitionPreference)) throw new Error('Invalid repetition preference');
}
function validateRequest(request: GenerationRequest): void {
  if (!request?.blueprint) throw new Error('Missing song blueprint');
  const blueprint = request.blueprint;
  validateSeed(blueprint.rootSeed);
  if (!identifier(blueprint.id) || typeof blueprint.title !== 'string' || typeof blueprint.concept !== 'string' || !Array.isArray(blueprint.sections) || !Number.isSafeInteger(request.variation) || request.variation < 0) throw new Error('Invalid blueprint identity or variation');
  blueprint.sections.forEach(validateSection);
  if (new Set(blueprint.sections.map(section => section.id)).size !== blueprint.sections.length || new Set(blueprint.sections.map(section => section.generationKey)).size !== blueprint.sections.length) throw new Error('Duplicate section IDs or generation keys');
  validateDocument(request.document);
  if (blueprint.sections.length !== request.document.sections.length || blueprint.sections.some(section => request.document.sections.find(document => document.sectionId === section.id)?.lines.length !== section.lineCount)) throw new Error('Blueprint and document sections/counts do not match');
  const section = request.document.sections.find(section => section.sectionId === request.sectionId);
  if (!section || !Array.isArray(request.targetLineIds) || !request.targetLineIds.length || new Set(request.targetLineIds).size !== request.targetLineIds.length || request.targetLineIds.some(id => !section.lines.some(line => line.id === id))) throw new Error('Invalid target section or line scope');
  if (!request.replacementPolicy || request.replacementPolicy.operation !== 'generate' || !['preserve', 'replace-explicitly'].includes(request.replacementPolicy.authored)) throw new Error('Invalid generation replacement policy');
  const budget = request.budget;
  if (!budget || !Number.isInteger(budget.maxAttempts) || budget.maxAttempts < 1 || budget.maxAttempts > MAX_ATTEMPTS || !Number.isInteger(budget.maxCandidates) || budget.maxCandidates < 1 || budget.maxCandidates > MAX_CANDIDATES || budget.maxCandidates > budget.maxAttempts) throw new Error('Search budget exceeds supported bounds');
  const policy = request.evaluationPolicy;
  if (!policy || !identifier(policy.id) || !identifier(policy.version) || !Array.isArray(policy.hardRuleIds) || policy.hardRuleIds.some(id => !['avoided', 'cliche'].includes(id)) || !policy.scoreWeights || Object.entries(policy.scoreWeights).some(([id, weight]) => !(supportedRuleIds as readonly string[]).includes(id) || !Number.isFinite(weight) || weight < 0)) throw new Error('Invalid evaluation policy');
  const style = blueprint.style;
  if (!style || !weightedReferences(style.genres) || !weightedReferences(style.moods) || !style.voice || ![style.traitIds, style.voice.textureIds, style.voice.deliveryIds].every(Array.isArray)) throw new Error('Invalid structured style intent');
  if ([...style.traitIds, ...style.voice.textureIds, ...style.voice.deliveryIds, ...[style.rhythmId, style.voice.typeId, style.voice.registerId].filter(value => value !== undefined)].some(value => !identifier(value)) || (style.bpm !== undefined && !Number.isFinite(style.bpm))) throw new Error('Invalid style references or tempo');
  const narrative = blueprint.narrative;
  if (!narrative || !identifier(narrative.narratorId) || !Array.isArray(narrative.subjectIds) || narrative.subjectIds.some(subject => !identifier(subject)) || new Set(narrative.subjectIds).size !== narrative.subjectIds.length || !Array.isArray(narrative.goals) || narrative.goals.some(goal => !goal || !identifier(goal.id) || typeof goal.description !== 'string' || !['open', 'developed', 'challenged', 'resolved'].includes(goal.status)) || new Set(narrative.goals.map(goal => goal.id)).size !== narrative.goals.length) throw new Error('Invalid narrative identities or goals');
  fingerprint(request); // Reject cyclic/non-JSON inputs before execution.
}
export interface SupportedGenerationProfile {
  readonly profile: ExecutionProfile;
  readonly catalog: CatalogSnapshot;
  readonly composer?: CandidateGenerator;
  readonly narrativeReducer?: NarrativeReducer;
}
const bundledProfiles: readonly SupportedGenerationProfile[] = [
  { profile: defaultProfile, catalog: generationCatalog },
  { profile: legacyGenerationProfile, catalog: legacyGenerationCatalog },
  { profile: baseProfile, catalog: baseCatalog },
];
export interface CoordinatorOptions {
  readonly profiles?: readonly SupportedGenerationProfile[];
  /** Infrastructure/test injection only; request data can never choose a composer. */
  readonly composer?: CandidateGenerator;
}
function profileIdentity(profile: ExecutionProfile): string {
  return fingerprint({ contractVersion: profile.contractVersion, algorithms: profile.algorithms, packs: [...profile.packs].sort((a, b) => compare(a.id, b.id)) });
}
export function createGenerationCoordinator(options: CoordinatorOptions = {}): GenerationCoordinator {
  const records = (options.profiles || bundledProfiles).map(record => {
    const packKey = fingerprint([...record.profile.packs].sort((a, b) => compare(a.id, b.id)));
    if (packKey !== fingerprint([...record.catalog.packs].sort((a, b) => compare(a.id, b.id)))) throw new Error('Registered profile must bind exact catalogue pack references');
    return { ...record, profileKey: profileIdentity(record.profile), packKey, catalogKey: catalogFingerprint(record.catalog) };
  });
  if (new Set(records.map(record => record.profileKey)).size !== records.length) throw new Error('Duplicate supported execution profiles');
  return {
    generate(request, snapshot): GenerationResult {
      try { validateRequest(request); } catch (error) { return failure('invalid-input', error instanceof Error ? error.message : 'Invalid generation request'); }
      let registered: typeof records[number] | undefined;
      try { registered = records.find(record => record.profileKey === profileIdentity(request.profile)); }
      catch { return failure('invalid-input', 'Malformed execution profile'); }
      if (!registered) return failure('missing-dependency', 'The exact execution profile is not supported');
      try { if (fingerprint([...snapshot.packs].sort((a, b) => compare(a.id, b.id))) !== registered.packKey || catalogFingerprint(snapshot) !== registered.catalogKey) return failure('missing-dependency', 'Requested catalogue contents or pack references do not match the supported profile'); }
      catch { return failure('missing-dependency', 'Malformed catalogue views or references'); }
      const style = styleResolver.resolve(request.blueprint.style, snapshot, namedRandom(request.blueprint.rootSeed, ['style-validation']));
      if (style.status !== 'resolved') return style;
      const language = languageResolver.resolve(request.blueprint.language, snapshot);
      if (language.status !== 'resolved') return language;
      const section = request.blueprint.sections.find(section => section.id === request.sectionId)!;
      let context: GenerationContext = { request, section, language: language.value, narrative: { assertions: [], goals: [], motifIds: [], provenance: {} }, neighbors: [], catalog: snapshot };
      let narrativeDiagnostics: readonly Diagnostic[] = [];
      if (registered.narrativeReducer) {
        const state = registered.narrativeReducer.derive(request.blueprint, request.document, section.id);
        if (state.status !== 'resolved') return state;
        context = { ...context, narrative: state.value };
        narrativeDiagnostics = state.diagnostics;
      }
      const planned = structurePlanner.plan(context);
      if (planned.status !== 'resolved') return planned;
      const plan = planned.value;
      if (!plan.editableSlots.length) return failure('exhausted', 'No eligible editable lines remain; authored content and locks were preserved');
      if (plan.editableSlots.some(slot => slot.templateIds.some(id => snapshot.templates.get(id)?.pattern.includes('{claim}'))) && typeof snapshot.choices.get([...language.value.intent.themeIds].sort((a, b) => b.weight - a.weight || compare(a.id, b.id))[0].id)?.claim !== 'string') return failure('missing-dependency', 'Statement hooks require the exact existing theme-claim pack');
      const candidates: Extract<GenerationResult, { status: 'ready' }>['candidates'][number][] = [];
      const seen = new Set<string>(), candidateIds = new Set<string>();
      const rejectionDiagnostics: Diagnostic[] = [];
      const composer = options.composer || registered.composer || legacyCandidateGenerator;
      for (let ordinal = 0; ordinal < request.budget.maxAttempts; ordinal++) {
        const random = namedRandom(request.blueprint.rootSeed, [section.generationKey, 'candidate', String(request.variation), String(ordinal)]);
        let candidate: LyricCandidate;
        try {
          candidate = composer.compose(context, plan, random, ordinal);
          if (candidate.ordinal !== ordinal || candidate.lines.length !== plan.editableSlots.length || plan.editableSlots.some(slot => !candidate.lines.some(line => line.targetLineId === slot.targetLineId && line.slotId === slot.slotId))) throw new Error('Composer must cover every editable slot exactly once');
          if (candidateIds.has(candidate.id)) throw new Error('Composer candidate IDs must be unique across attempts');
          candidateIds.add(candidate.id);
          if (request.blueprint.language.dialect) {
            const dialect = request.blueprint.language.dialect;
            const pack = snapshot.dialects.get(dialect.packId);
            if (!pack) return failure('missing-dependency', `Dialect pack “${dialect.packId}” is unavailable`);
            const provisional = candidateContextLines(candidate, context);
            const original = request.document.sections.find(document => document.sectionId === section.id)!;
            const transformedDocument = withRevision([{ ...original, lines: original.lines.map(line => ({ ...line, text: provisional.find(current => current.lineId === line.id)!.text, origin: candidate.lines.some(update => update.targetLineId === line.id) ? 'generated' as const : line.origin, annotations: [] })) }]);
            const preview = dialectTransformer.preview(transformedDocument, pack, dialect, { operation: 'dialect', authored: request.replacementPolicy.authored });
            if (preview.diagnostics.some(issue => issue.severity === 'error')) return { status: 'invalid-input', diagnostics: preview.diagnostics };
            const edits = new Map<string, typeof preview.edits>();
            for (const line of candidate.lines) edits.set(line.targetLineId, preview.edits.filter(edit => edit.lineId === line.targetLineId));
            candidate = { ...candidate, lines: candidate.lines.map(line => {
              let text = line.text;
              for (const edit of [...(edits.get(line.targetLineId) || [])].sort((a, b) => b.range[0] - a.range[0])) text = text.slice(0, edit.range[0]) + edit.after + text.slice(edit.range[1]);
              return { ...line, text, annotations: text === line.text ? line.annotations : [] };
            }) };
          }
          const provisional = candidateContextLines(candidate, context);
          const analysis = textAnalyzer.analyze(provisional, snapshot.pronunciations);
          const measuredEvaluation = candidateEvaluator.evaluate(candidate, context, analysis);
          const evaluation = narrativeDiagnostics.length ? { ...measuredEvaluation, diagnostics: [...measuredEvaluation.diagnostics, ...narrativeDiagnostics] } : measuredEvaluation;
          if (!evaluation.admissible) { rejectionDiagnostics.push(...evaluation.diagnostics.filter(issue => issue.severity === 'error')); continue; }
          const content = fingerprint([...candidate.lines].sort((a, b) => compare(a.targetLineId, b.targetLineId)).map(line => ({ targetLineId: line.targetLineId, text: line.text, annotations: registered.narrativeReducer ? line.annotations.map(annotation => ({ evidence: annotation.evidence, effect: annotation.effect.kind === 'assert' ? { kind: 'assert', assertion: { ...annotation.effect.assertion, id: 'fact-instance' } } : annotation.effect })) : line.annotations })));
          if (seen.has(content)) continue;
          seen.add(content); candidates.push({ candidate, evaluation });
        } catch (error) { return failure('invalid-input', error instanceof Error ? error.message : 'Invalid composer output'); }
      }
      if (!candidates.length) return { status: 'exhausted', diagnostics: [issue('exhausted', 'No admissible candidate was found within the fixed attempt budget.'), ...rejectionDiagnostics.slice(0, 16)] };
      const score = (entry: typeof candidates[number]) => Object.values(entry.evaluation.scores).reduce((sum, value) => sum + value, 0);
      candidates.sort((a, b) => score(b) - score(a) || a.candidate.ordinal - b.candidate.ordinal || compare(a.candidate.id, b.candidate.id));
      const selected = candidates.slice(0, request.budget.maxCandidates);
      return { status: 'ready', candidates: selected, selectedCandidateId: selected[0].candidate.id };
    },
  };
}
export const generationCoordinator = createGenerationCoordinator();
export function makeRecipe(request: GenerationRequest, candidate: LyricCandidate, snapshot: CatalogSnapshot = generationCatalog): ReplayRecipe {
  validateRequest(request);
  const section = request.blueprint.sections.find(section => section.id === request.sectionId)!;
  if (!candidate || !identifier(candidate.id) || !Number.isInteger(candidate.ordinal) || candidate.ordinal < 0 || candidate.ordinal >= request.budget.maxAttempts) throw new Error('Invalid candidate identity/attempt for recipe');
  const language = languageResolver.resolve(request.blueprint.language, snapshot);
  if (language.status !== 'resolved') throw new Error('Recipe language dependencies are unavailable');
  const context: GenerationContext = { request, section, language: language.value, catalog: snapshot, narrative: { assertions: [], goals: [], motifIds: [], provenance: {} }, neighbors: [] };
  const plan = structurePlanner.plan(context);
  if (plan.status !== 'resolved' || !plan.value.editableSlots.length || candidate.lines.length !== plan.value.editableSlots.length || plan.value.editableSlots.some(slot => !candidate.lines.some(line => line.targetLineId === slot.targetLineId && line.slotId === slot.slotId))) throw new Error('Recipe candidate must cover its complete editable scope');
  const lines = candidateContextLines(candidate, context);
  const provisional = withRevision(request.document.sections.map(document => document.sectionId !== section.id ? document : { ...document, lines: document.lines.map(line => { const update = candidate.lines.find(update => update.targetLineId === line.id); return update ? { ...line, text: update.text, annotations: update.annotations, origin: 'generated' as const } : line; }) }));
  validateDocument(provisional);
  const evaluation = candidateEvaluator.evaluate(candidate, context, textAnalyzer.analyze(lines, snapshot.pronunciations));
  if (!evaluation.admissible) throw new Error('An inadmissible candidate cannot receive an accepted replay recipe');
  const inputs = structuredClone({ blueprint: request.blueprint, baselineDocument: request.document, sectionId: request.sectionId, targetLineIds: request.targetLineIds, replacementPolicy: request.replacementPolicy, evaluationPolicy: request.evaluationPolicy, budget: request.budget });
  const output = outputFingerprint(candidate);
  const identity = fingerprint({ inputs, profile: request.profile, variation: request.variation, ordinal: candidate.ordinal, output });
  return freeze({ id: `recipe:${identity}`, inputs, inputFingerprint: fingerprint(inputs), profile: structuredClone(request.profile), rootSeed: request.blueprint.rootSeed, generationKey: section.generationKey, variation: request.variation, candidateOrdinal: candidate.ordinal, outputFingerprint: output });
}
