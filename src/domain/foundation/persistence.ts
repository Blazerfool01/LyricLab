/** Portable storage boundary. No browser storage, current-document writes or ambient IDs/time. */
import type { Project, SongSection, StyleSpec } from '../types';
import { emptyEngineState, fromLegacyProject, labelFor, referenceFor } from './adapters';
import type { EditorEngineState } from './adapters';
import { catalog, generationCatalog, legacyGenerationCatalog } from './catalogs';
import type { CatalogSnapshot, Diagnostic, DocumentLine, DocumentSection, ExecutionProfile, GenerationContext, GenerationRequest, LyricCandidate, ProjectEnvelope, ReplayRecipe, Resolution, SectionIntent, SemanticAnnotation, SongBlueprint, SongSpec, TextRange } from './contracts';
import { outputFingerprint, validateDocument, withRevision } from './editing';
import { canonical, fingerprint, validateSeed } from './randomness';
import { createDefaultProfile, createGenerationCoordinator, legacyCandidateGenerator, MAX_ATTEMPTS, MAX_CANDIDATES } from './generation';
import { foundationCoordinator, legacyNarrativeCatalog, legacyNarrativeProfile, narrativeCatalog, narrativeComposer, narrativeProfile } from './narrative-generation';
import { narrativeReducer } from './narrative';
import { candidateContextLines, candidateEvaluator } from './constraints';
import { dialectTransformer } from './dialect';
import { textAnalyzer } from './analysis';

export const PROJECT_SCHEMA_VERSION = 2;
export const SONGSPEC_SCHEMA_VERSION = 1;
export const MAX_PROJECT_BYTES = 4 * 1024 * 1024;
export const MAX_PROJECT_SECTIONS = 100;
export const MAX_SECTION_LINES = 100;
const epoch = '1970-01-01T00:00:00.000Z';
const isId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const required = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const diagnostic = (ruleId: string, message: string, severity: Diagnostic['severity'] = 'warning', lineIds: readonly string[] = []): Diagnostic => ({ ruleId, message, severity, origin: 'context', lineIds });
const invalid = <T>(error: unknown): Resolution<T> => ({ status: 'invalid-input', diagnostics: [diagnostic('invalid-input', error instanceof Error ? error.message : 'Invalid project data', 'error')] });
const sectionTypes = ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'custom'];
const roles = ['establish', 'develop', 'challenge', 'reveal', 'resolve'];
const archetypes = ['title-drop', 'refrain', 'statement', 'question', 'contrast', 'chant', 'call-response'];
const statuses = ['open', 'developed', 'challenged', 'resolved'];
const clone = <T>(value: T): T => structuredClone(value);
function portableInput(value: unknown): unknown {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  const text = canonical(parsed);
  required(new TextEncoder().encode(text).byteLength <= MAX_PROJECT_BYTES, `Project exceeds the ${MAX_PROJECT_BYTES}-byte size limit; no content was truncated.`);
  return clone(parsed);
}
class Reader {
  readonly diagnostics: Diagnostic[] = [];
  warn(message: string, lineIds: readonly string[] = []) { this.diagnostics.push(diagnostic('repaired-project', message, 'warning', lineIds)); }
  str(value: unknown, fallback: string, name: string): string { if (typeof value === 'string') return value; this.warn(`${name} was repaired to a deterministic default.`); return fallback; }
  strings(value: unknown, name: string): string[] {
    if (!Array.isArray(value)) { this.warn(`${name} was repaired to an empty list.`); return []; }
    if (value.some(x => typeof x !== 'string')) this.warn(`Invalid optional ${name} entries were omitted.`);
    return value.filter((x): x is string => typeof x === 'string');
  }
  flag(value: unknown, name: string): boolean { if (typeof value === 'boolean') return value; this.warn(`${name} was repaired conservatively to ${value === undefined ? 'false' : 'true'}.`); return value !== undefined; }
  weighted(value: unknown, name: string): { id: string; weight: number }[] {
    required(Array.isArray(value), `${name} must be a weighted-reference list.`);
    const entries = value as { id: string; weight: number }[];
    required(entries.every(x => x && isId(x.id) && Number.isFinite(x.weight) && x.weight > 0), `${name} contains invalid identities or weights.`);
    required(new Set(entries.map(x => x.id)).size === entries.length, `${name} contains duplicate identities.`);
    return entries.map(x => ({ ...x }));
  }
  timestamp(value: unknown): string { if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value; this.warn('Missing/invalid timestamp was repaired to a fixed epoch.'); return epoch; }
}
function identities(values: readonly unknown[], prefix: string, reader: Reader): string[] {
  const reserved = new Set(values.filter(isId)), used = new Set<string>();
  return values.map((value, index) => {
    if (isId(value) && !used.has(value)) { used.add(value); return value; }
    let replacement = `repair:${prefix}:${index + 1}`, suffix = 1;
    while (reserved.has(replacement) || used.has(replacement)) replacement = `repair:${prefix}:${index + 1}:${suffix++}`;
    used.add(replacement); reader.warn(`Missing or duplicate ${prefix} identity at position ${index + 1} was repaired deterministically.`);
    return replacement;
  });
}
function normalizeBlueprint(value: unknown, reader: Reader): SongBlueprint {
  required(isRecord(value), 'Missing song blueprint.');
  const raw = value as unknown as SongBlueprint;
  required(typeof raw.title === 'string' && typeof raw.concept === 'string', 'Blueprint requires title and concept strings.');
  validateSeed(raw.rootSeed);
  required(isRecord(raw.style) && isRecord(raw.style.voice), 'Blueprint requires a structured style and voice.');
  const style = raw.style;
  const refs = (value: unknown, name: string): string[] => {
    if (!Array.isArray(value)) { reader.warn(`Missing/malformed optional ${name} references were repaired to an empty list.`); return []; }
    if (value.some(ref => !isId(ref))) reader.warn(`Invalid optional ${name} references were omitted.`);
    return value.filter(isId);
  };
  const optionalRef = (value: unknown, name: string): string | undefined => { if (value === undefined) return undefined; if (isId(value)) return value; reader.warn(`Invalid optional ${name} reference was omitted.`); return undefined; };
  const normalizedStyle: SongBlueprint['style'] = { ...style, genres: reader.weighted(style.genres, 'Genres'), moods: reader.weighted(style.moods, 'Moods'), voice: { ...style.voice, textureIds: refs(style.voice.textureIds, 'Voice textures'), deliveryIds: refs(style.voice.deliveryIds, 'Voice deliveries') }, traitIds: refs(style.traitIds, 'Style traits') };
  for (const field of ['typeId', 'registerId'] as const) { const ref = optionalRef(style.voice[field], field); if (ref === undefined) delete (normalizedStyle.voice as { typeId?: string; registerId?: string })[field]; }
  if (optionalRef(style.rhythmId, 'rhythm') === undefined) delete (normalizedStyle as { rhythmId?: string }).rhythmId;
  if (style.bpm !== undefined && (!Number.isFinite(style.bpm) || style.bpm <= 0)) { reader.warn('Invalid optional tempo was omitted.'); delete (normalizedStyle as { bpm?: number }).bpm; }
  required(isRecord(raw.language), 'Blueprint requires language intent.');
  const language = raw.language;
  required(['first', 'second', 'third'].includes(language.perspective) && isId(language.registerId) && typeof language.motif === 'string', 'Invalid required language perspective/register/motif.');
  const normalizedLanguage: SongBlueprint['language'] = { ...language, themeIds: reader.weighted(language.themeIds, 'Themes'), toneIds: refs(language.toneIds, 'Tones'), preferredTerms: reader.strings(language.preferredTerms, 'preferred terms'), avoidedTerms: reader.strings(language.avoidedTerms, 'avoided terms') };
  if (language.dialect !== undefined && (!isRecord(language.dialect) || !isId(language.dialect.packId) || ![1, 2, 3, 4, 5].includes(language.dialect.strength) || !['metadata', 'vocabulary', 'phonetic'].includes(language.dialect.mode))) { reader.warn('Invalid optional dialect settings were omitted.'); delete (normalizedLanguage as { dialect?: unknown }).dialect; }
  required(Array.isArray(raw.sections) && raw.sections.length <= MAX_PROJECT_SECTIONS, 'Invalid or oversized blueprint section list.');
  required(raw.sections.every(isRecord), 'Each blueprint section must be an object.');
  const sectionIds = identities(raw.sections.map(s => s.id), 'section', reader), generationKeys = identities(raw.sections.map(s => s.generationKey), 'generation-key', reader);
  const sections = raw.sections.map((section, i): SectionIntent => {
    required(sectionTypes.includes(section.type) && roles.includes(section.role) && typeof section.purpose === 'string', `Invalid required type, role or purpose in section ${i + 1}.`);
    required(Number.isInteger(section.lineCount) && section.lineCount >= 0 && section.lineCount <= MAX_SECTION_LINES && Number.isFinite(section.intensity) && section.intensity >= 0 && section.intensity <= 100, `Invalid section ${i + 1} count/intensity.`);
    required(isRecord(section.constraints), `Missing section ${i + 1} constraints.`);
    const constraints = { ...section.constraints };
    if (constraints.rhymeScheme !== undefined && (typeof constraints.rhymeScheme !== 'string' || !/^[A-Z]*$/.test(constraints.rhymeScheme))) { reader.warn(`Invalid optional section ${i + 1} rhyme scheme was omitted.`); delete constraints.rhymeScheme; }
    const range = constraints.syllableRange;
    if (range !== undefined && (!Array.isArray(range) || range.length !== 2 || !range.every(x => Number.isFinite(x) && x > 0) || range[0] > range[1])) { reader.warn(`Invalid optional section ${i + 1} syllable range was omitted.`); delete constraints.syllableRange; }
    if (optionalRef(constraints.deliveryId, 'delivery') === undefined) delete constraints.deliveryId;
    if (constraints.repetitionPreference !== undefined && !['low', 'balanced', 'high'].includes(constraints.repetitionPreference)) { reader.warn('Invalid repetition preference was omitted.'); delete constraints.repetitionPreference; }
    const normalized = { ...section, id: sectionIds[i], generationKey: generationKeys[i], constraints };
    if (normalized.name !== undefined && typeof normalized.name !== 'string') { reader.warn('Invalid optional section name was omitted.'); delete normalized.name; }
    if (normalized.hookArchetype !== undefined && !archetypes.includes(normalized.hookArchetype)) { reader.warn('Invalid optional hook archetype was omitted.'); delete normalized.hookArchetype; }
    return normalized;
  });
  required(isRecord(raw.narrative) && isId(raw.narrative.narratorId), 'Blueprint requires a stable narrative narrator.');
  const subjectIds = refs(raw.narrative.subjectIds, 'Narrative subjects');
  required(new Set(subjectIds).size === subjectIds.length && Array.isArray(raw.narrative.goals), 'Invalid narrative subjects/goals.');
  const goalIds = new Set<string>();
  const goals = raw.narrative.goals.filter(goal => {
    const valid = goal && isId(goal.id) && typeof goal.description === 'string' && statuses.includes(goal.status) && !goalIds.has(goal.id);
    if (!valid) reader.warn('Invalid optional planned narrative goal was omitted.'); else goalIds.add(goal.id);
    return valid;
  });
  if (!isId(raw.id)) reader.warn('Missing project identity was repaired from a fixed content fingerprint.');
  return { ...raw, id: isId(raw.id) ? raw.id : `repair:project:${fingerprint(value)}`, style: normalizedStyle, language: normalizedLanguage, sections, narrative: { ...raw.narrative, subjectIds, goals } };
}
function normalizeDocument(value: unknown, blueprint: SongBlueprint, rawBlueprint: SongBlueprint, reader: Reader): { document: ProjectEnvelope['document']; blueprint: SongBlueprint } {
  required(isRecord(value) && Array.isArray(value.sections), 'Missing accepted document sections.');
  const raw = value as unknown as ProjectEnvelope['document'];
  required(raw.sections.length === blueprint.sections.length, 'Blueprint/document section counts do not match.');
  const queues = new Map<string, number[]>();
  rawBlueprint.sections.forEach((section, i) => { const queue = queues.get(section.id) || []; queue.push(i); queues.set(section.id, queue); });
  const matches = raw.sections.map((section, i) => {
    required(isRecord(section) && Array.isArray(section.lines) && section.lines.length <= MAX_SECTION_LINES, 'Invalid or oversized accepted section lines.');
    const queue = queues.get(section.sectionId);
    const matched = queue?.shift();
    if (matched !== undefined) return matched;
    required(!isId(section.sectionId) && !isId(rawBlueprint.sections[i]?.id), 'Accepted section references an unavailable blueprint section.');
    queues.get(rawBlueprint.sections[i].id)?.shift(); return i;
  });
  required(new Set(matches).size === matches.length, 'Ambiguous accepted section mapping.');
  const flatLines = raw.sections.flatMap(section => section.lines);
  required(flatLines.every(line => isRecord(line) && typeof line.text === 'string'), 'Every accepted line requires an object and text string.');
  const lineIds = identities(flatLines.map(line => line.id), 'line', reader), annotationIds = new Set<string>();
  let lineIndex = 0;
  const sections: DocumentSection[] = raw.sections.map((section, i) => ({ sectionId: blueprint.sections[matches[i]].id, locked: reader.flag(section.locked, 'Section lock'), lines: section.lines.map(rawLine => {
    const lineId = lineIds[lineIndex++], text = rawLine.text;
    let locked = reader.flag(rawLine.locked, 'Line lock');
    const ranges = rawLine.lockedRanges;
    let lockedRanges: readonly TextRange[] = [];
    const validRanges = Array.isArray(ranges) && ranges.every(range => Array.isArray(range) && range.length === 2 && range.every(Number.isInteger) && range[0] >= 0 && range[0] < range[1] && range[1] <= text.length);
    const sorted = validRanges ? [...ranges].sort((a, b) => a[0] - b[0]) : [];
    if (validRanges && sorted.every((range, j) => j === 0 || range[0] >= sorted[j - 1][1])) lockedRanges = clone(ranges);
    else if (ranges !== undefined) { locked = true; reader.warn('Unsafe locked ranges were cleared and the whole accepted line was locked.', [lineId]); }
    const origin = ['authored', 'generated', 'unknown'].includes(rawLine.origin) ? rawLine.origin : 'unknown';
    if (origin !== rawLine.origin) reader.warn('Missing/invalid accepted origin was repaired conservatively to unknown.', [lineId]);
    const annotations: SemanticAnnotation[] = [];
    if (!Array.isArray(rawLine.annotations)) { if (rawLine.annotations !== undefined) reader.warn('Malformed optional annotations were ignored.', [lineId]); }
    else for (const annotation of rawLine.annotations) {
      try {
        required(annotation && !annotationIds.has(annotation.id), 'Duplicate/malformed annotation');
        validateDocument(withRevision([{ sectionId: 'validation-section', locked: false, lines: [{ id: 'validation-line', text, origin, locked, lockedRanges: [], annotations: [annotation] }] }]));
        if (annotation.effect.kind === 'assert') required([blueprint.narrative.narratorId, ...blueprint.narrative.subjectIds].includes(annotation.effect.assertion.subjectId), 'Dangling annotation subject');
        annotationIds.add(annotation.id); annotations.push(clone(annotation));
      } catch { reader.warn('Stale or malformed optional semantic evidence was ignored; accepted text is preserved.', [lineId]); }
    }
    if (rawLine.recipeId !== undefined && !isId(rawLine.recipeId)) reader.warn('Invalid optional historical recipe reference was omitted.', [lineId]);
    return { ...rawLine, id: lineId, text, origin, locked, lockedRanges, annotations, ...(isId(rawLine.recipeId) ? { recipeId: rawLine.recipeId } : {}) };
  }) }));
  for (const section of sections) for (const line of section.lines) if (line.recipeId !== undefined && !isId(line.recipeId)) delete (line as { recipeId?: string }).recipeId;
  const document = withRevision(sections);
  if (raw.revision !== document.revision) reader.warn('Accepted document revision was recomputed from repaired content.');
  const repairedBlueprint = { ...blueprint, sections: blueprint.sections.map(section => {
    const count = sections.find(current => current.sectionId === section.id)!.lines.length;
    if (count === section.lineCount) return section;
    reader.warn(`Section ${section.id} line count was aligned to preserved accepted lines.`); return { ...section, lineCount: count };
  }) };
  validateDocument(document);
  return { document, blueprint: repairedBlueprint };
}
function validateRecipeShape(recipe: ReplayRecipe): void {
  required(recipe && isId(recipe.id) && isRecord(recipe.inputs) && isRecord(recipe.profile) && Number.isSafeInteger(recipe.profile.contractVersion) && recipe.profile.contractVersion > 0 && isRecord(recipe.profile.algorithms) && Array.isArray(recipe.profile.packs), 'Malformed replay recipe/profile.');
  const refs = Object.values(recipe.profile.algorithms);
  required(refs.length > 0 && refs.every(ref => ref && isId(ref.id) && isId(ref.version)), 'Invalid recorded algorithm references.');
  required(recipe.profile.packs.every(pack => pack && isId(pack.id) && isId(pack.version) && isId(pack.contentHash)) && new Set(recipe.profile.packs.map(pack => pack.id)).size === recipe.profile.packs.length, 'Invalid recorded pack references.');
  validateSeed(recipe.rootSeed);
  required(Number.isSafeInteger(recipe.variation) && recipe.variation >= 0 && Number.isInteger(recipe.candidateOrdinal) && recipe.candidateOrdinal >= 0 && isId(recipe.generationKey) && isId(recipe.inputFingerprint) && isId(recipe.outputFingerprint), 'Invalid recorded attempt/fingerprints.');
  const inputs = recipe.inputs, reader = new Reader(), blueprint = normalizeBlueprint(inputs.blueprint, reader);
  required(fingerprint(blueprint) === fingerprint(inputs.blueprint), 'Replay inputs require intact blueprint identities and constraints.');
  validateDocument(inputs.baselineDocument);
  const section = inputs.blueprint.sections.find(section => section.id === inputs.sectionId), baseline = inputs.baselineDocument.sections.find(section => section.sectionId === inputs.sectionId);
  required(section && baseline && recipe.rootSeed === blueprint.rootSeed && recipe.generationKey === section.generationKey && blueprint.sections.length === inputs.baselineDocument.sections.length && blueprint.sections.every(section => inputs.baselineDocument.sections.find(current => current.sectionId === section.id)?.lines.length === section.lineCount), 'Invalid replay baseline/scope/seed.');
  required(Array.isArray(inputs.targetLineIds) && inputs.targetLineIds.length > 0 && new Set(inputs.targetLineIds).size === inputs.targetLineIds.length && inputs.targetLineIds.every(id => baseline!.lines.some(line => line.id === id)), 'Invalid replay target mapping.');
  required(inputs.replacementPolicy?.operation === 'generate' && ['preserve', 'replace-explicitly'].includes(inputs.replacementPolicy.authored), 'Invalid replay replacement policy.');
  required(inputs.budget && Number.isInteger(inputs.budget.maxAttempts) && inputs.budget.maxAttempts >= 1 && inputs.budget.maxAttempts <= MAX_ATTEMPTS && Number.isInteger(inputs.budget.maxCandidates) && inputs.budget.maxCandidates >= 1 && inputs.budget.maxCandidates <= MAX_CANDIDATES && inputs.budget.maxCandidates <= inputs.budget.maxAttempts && recipe.candidateOrdinal < inputs.budget.maxAttempts, 'Invalid recorded search bounds.');
  required(inputs.evaluationPolicy && isId(inputs.evaluationPolicy.id) && isId(inputs.evaluationPolicy.version) && Array.isArray(inputs.evaluationPolicy.hardRuleIds) && inputs.evaluationPolicy.hardRuleIds.every(isId) && isRecord(inputs.evaluationPolicy.scoreWeights) && Object.values(inputs.evaluationPolicy.scoreWeights).every(weight => Number.isFinite(weight) && weight >= 0), 'Invalid recorded evaluation policy.');
  required(recipe.inputFingerprint === fingerprint(inputs), 'Recorded input fingerprint does not match original replay inputs.');
}
function migrateLegacy(value: Record<string, unknown>, reader: Reader): ProjectEnvelope {
  required(typeof value.title === 'string' && isRecord(value.style) && Array.isArray(value.structure) && value.structure.length <= MAX_PROJECT_SECTIONS, 'Legacy project requires title, style and a bounded section list.');
  const raw = value as unknown as Project, style = raw.style;
  const weighted = (value: unknown, name: string): { id: string; weight: number }[] => {
    if (!Array.isArray(value)) { reader.warn(`Missing/malformed optional legacy ${name} were repaired to an empty list.`); return []; }
    const refs = new Map<string, { id: string; weight: number }>();
    for (const item of value) {
      if (!isRecord(item) || !isId(item.id)) { reader.warn(`Invalid optional legacy ${name} entry was omitted.`); continue; }
      const weight = typeof item.weight === 'number' && Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1;
      if (weight !== item.weight) reader.warn(`Invalid optional legacy ${name} weight was repaired to 1 while retaining its identity.`);
      if (refs.has(item.id)) reader.warn(`Duplicate legacy ${name} reference was merged.`);
      const sum = (refs.get(item.id)?.weight || 0) + weight;
      if (!Number.isFinite(sum)) reader.warn(`Overflowing duplicate legacy ${name} weights were repaired to the largest finite value.`);
      refs.set(item.id, { id: item.id, weight: Number.isFinite(sum) ? sum : Number.MAX_VALUE });
    }
    return [...refs.values()];
  };
  const voice = isRecord(style.voice) ? style.voice : {} as StyleSpec['voice'];
  const sectionIds = identities(raw.structure.map(section => section?.id), 'section', reader);
  required(raw.structure.every(section => isRecord(section) && Array.isArray(section.lines) && section.lines.length <= MAX_SECTION_LINES && section.lines.every(line => isRecord(line) && typeof line.text === 'string')), 'Every legacy section requires bounded accepted text lines.');
  const lineIds = identities(raw.structure.flatMap(section => section.lines.map(line => line.id)), 'line', reader);
  let lineIndex = 0;
  const language = isRecord(raw.language) ? raw.language : {} as Project['language'];
  const seed = Number.isSafeInteger(raw.seed) ? raw.seed : 2408;
  if (!Number.isSafeInteger(raw.seed)) reader.warn('Missing/invalid legacy seed was repaired to the fixed seed 2408.');
  if ((seed >>> 0) !== seed) reader.warn('Legacy seed was normalized using its established unsigned-32-bit coercion.');
  if (!isId(raw.id)) reader.warn('Missing legacy project identity was repaired from a fixed content fingerprint.');
  if (!Number.isFinite(style.bpm) || style.bpm <= 0) reader.warn('Invalid/missing legacy tempo was repaired to 92.');
  if (!['first', 'second', 'third'].includes(language.perspective)) reader.warn('Invalid/missing legacy perspective was repaired to first person.');
  if (![1, 2, 3, 4, 5].includes(language.dialectStrength)) reader.warn('Invalid/missing legacy dialect strength was repaired to 1.');
  const project: Project = { schemaVersion: 1, app: 'LyricLab', id: isId(raw.id) ? raw.id : `repair:project:${fingerprint(value)}`, title: raw.title, concept: reader.str(raw.concept, '', 'Concept'), seed: seed >>> 0,
    style: { genres: weighted(style.genres, 'Genres'), moods: weighted(style.moods, 'Moods'), bpm: Number.isFinite(style.bpm) && style.bpm > 0 ? style.bpm : 92, rhythm: reader.str(style.rhythm, 'Steady 4/4', 'Rhythm'), voice: { type: reader.str(voice.type, 'Lead', 'Voice type'), register: reader.str(voice.register, 'Mid-range', 'Vocal register'), texture: reader.strings(voice.texture, 'Voice textures'), delivery: reader.strings(voice.delivery, 'Voice delivery') }, bass: reader.strings(style.bass, 'Bass'), drums: reader.strings(style.drums, 'Drums'), instrumentation: reader.strings(style.instrumentation, 'Instrumentation'), production: reader.strings(style.production, 'Production'), mix: reader.strings(style.mix, 'Mix') },
    language: { theme: reader.str(language.theme, 'Finding your way', 'Theme'), secondaryTheme: reader.str(language.secondaryTheme, '', 'Secondary theme'), perspective: ['first', 'second', 'third'].includes(language.perspective) ? language.perspective : 'first', register: reader.str(language.register, 'Poetic', 'Language register'), motif: reader.str(language.motif, '', 'Motif'), preferred: reader.str(language.preferred, '', 'Preferred vocabulary'), avoided: reader.str(language.avoided, '', 'Avoided vocabulary'), dialect: reader.str(language.dialect, 'Standard', 'Dialect'), dialectStrength: [1, 2, 3, 4, 5].includes(language.dialectStrength) ? language.dialectStrength : 1 },
    structure: raw.structure.map((section, i): SongSection => {
      const validType = sectionTypes.includes(section.type), validIntensity = Number.isFinite(section.intensity) && section.intensity >= 0 && section.intensity <= 100, validRhyme = typeof section.rhymeScheme === 'string' && /^[A-Z]*$/.test(section.rhymeScheme), validRange = Array.isArray(section.syllableRange) && section.syllableRange.length === 2 && section.syllableRange.every(x => Number.isFinite(x) && x > 0) && section.syllableRange[0] <= section.syllableRange[1];
      if (!validType) reader.warn(`Invalid legacy section ${i + 1} type was repaired to custom.`);
      if (!validIntensity) reader.warn(`Invalid legacy section ${i + 1} intensity was repaired to 40.`);
      if (!validRhyme) reader.warn(`Invalid legacy section ${i + 1} rhyme scheme was repaired to ABAB.`);
      if (!validRange) reader.warn(`Invalid legacy section ${i + 1} syllable range was repaired to [8, 12].`);
      return { id: sectionIds[i], type: validType ? section.type : 'custom', name: reader.str(section.name, `Section ${i + 1}`, 'Section name'), purpose: reader.str(section.purpose, 'Develop the song', 'Section purpose'), intensity: validIntensity ? section.intensity : 40, rhymeScheme: validRhyme ? section.rhymeScheme : 'ABAB', syllableRange: validRange ? clone(section.syllableRange) : [8, 12], delivery: reader.str(section.delivery, 'Melodic', 'Section delivery'), locked: reader.flag(section.locked, 'Section lock'), lines: section.lines.map(line => ({ id: lineIds[lineIndex++], text: line.text, locked: reader.flag(line.locked, 'Line lock'), authored: line.authored === true })) };
    }), settings: { ignoredWarnings: reader.strings(raw.settings?.ignoredWarnings, 'ignored warnings') }, updatedAt: reader.timestamp(raw.updatedAt),
  };
  const { blueprint, document } = fromLegacyProject(project);
  reader.diagnostics.push(diagnostic('legacy-migration', 'Legacy authored flags were preserved; nonempty false/missing flags have unknown origin. No historical replay recipes were invented.', 'info'));
  return { schemaVersion: 2, app: 'LyricLab', id: blueprint.id, blueprint, document, recipes: [], variations: {}, updatedAt: project.updatedAt, ignoredWarnings: project.settings.ignoredWarnings };
}

export function decodeProject(value: unknown): Resolution<ProjectEnvelope> {
  try {
    const parsed = portableInput(value); required(isRecord(parsed) && parsed.app === 'LyricLab', 'This is not a LyricLab project.');
    const raw = parsed as Record<string, unknown>, reader = new Reader();
    if (raw.schemaVersion === 1) { const migrated = migrateLegacy(raw, reader); validateDocument(migrated.document); portableInput(migrated); return { status: 'resolved', value: migrated, diagnostics: reader.diagnostics }; }
    required(raw.schemaVersion === 2, 'Unsupported LyricLab schema version.');
    const normalizedBlueprint = normalizeBlueprint(raw.blueprint, reader);
    const accepted = normalizeDocument(raw.document, normalizedBlueprint, raw.blueprint as SongBlueprint, reader);
    const id = isId(raw.id) ? raw.id : accepted.blueprint.id;
    if (id !== accepted.blueprint.id) { reader.warn('Envelope/blueprint project identities were aligned.'); }
    const recipes: ReplayRecipe[] = [], seenRecipes = new Set<string>();
    if (Array.isArray(raw.recipes)) for (const recipe of raw.recipes as ReplayRecipe[]) {
      try { validateRecipeShape(recipe); required(!seenRecipes.has(recipe.id), 'Duplicate recipe identity.'); seenRecipes.add(recipe.id); recipes.push(clone(recipe)); }
      catch { reader.warn('Malformed optional historical recipe was omitted; accepted text and valid history were preserved.'); }
    } else reader.warn('Missing/malformed optional recipe history was repaired to an empty list.');
    const variations: Record<string, number> = {};
    if (isRecord(raw.variations)) for (const [key, value] of Object.entries(raw.variations)) {
      if (isId(key) && Number.isSafeInteger(value) && (value as number) >= 0) Object.defineProperty(variations, key, { value, enumerable: true, writable: true, configurable: true });
      else reader.warn('Invalid optional variation counter was omitted.');
    } else reader.warn('Missing/malformed optional variation counters were repaired to an empty map.');
    const originalSections = (raw.blueprint as SongBlueprint).sections;
    accepted.blueprint.sections.forEach((section, index) => {
      const oldKey = originalSections[index].generationKey;
      if (isId(oldKey) && oldKey !== section.generationKey && Object.prototype.hasOwnProperty.call(variations, oldKey) && !Object.prototype.hasOwnProperty.call(variations, section.generationKey)) {
        Object.defineProperty(variations, section.generationKey, { value: variations[oldKey], enumerable: true, writable: true, configurable: true });
        reader.warn(`Variation counter was copied to repaired generation key ${section.generationKey}; historical recipe keys were retained.`);
      }
    });
    return { status: 'resolved', value: { schemaVersion: 2, app: 'LyricLab', id, blueprint: { ...accepted.blueprint, id }, document: accepted.document, recipes, variations, updatedAt: reader.timestamp(raw.updatedAt), ignoredWarnings: reader.strings(raw.ignoredWarnings, 'ignored warnings') }, diagnostics: reader.diagnostics };
  } catch (error) { return invalid(error); }
}
export function serializeProject(envelope: ProjectEnvelope): string {
  const result = decodeProject(envelope);
  if (result.status !== 'resolved') throw new Error(result.diagnostics.map(issue => issue.message).join('; '));
  return canonical(result.value);
}

export function toEditorProject(envelope: ProjectEnvelope): Project {
  const result = decodeProject(envelope); if (result.status !== 'resolved') throw new Error(result.diagnostics.map(issue => issue.message).join('; '));
  const source = result.value, blueprint = source.blueprint;
  const choices = (ids: readonly string[]) => ids.map(labelFor);
  const traitCategory = (id: string) => generationCatalog.traits.get(id)?.categoryId || generationCatalog.choices.get(id)?.category || (id.startsWith('unavailable:') ? id.split(':')[1] : id.split(':')[0]);
  const traits = (category: string) => choices(blueprint.style.traitIds.filter(id => category === 'instrument' ? !['production', 'drums', 'bass', 'mix'].includes(traitCategory(id)) : traitCategory(id) === category));
  const project: Project = { schemaVersion: 1, app: 'LyricLab', id: source.id, title: blueprint.title, concept: blueprint.concept, seed: blueprint.rootSeed,
    style: { genres: blueprint.style.genres.map(ref => ({ ...ref })), moods: blueprint.style.moods.map(ref => ({ id: labelFor(ref.id), weight: ref.weight })), bpm: blueprint.style.bpm ?? 92, rhythm: labelFor(blueprint.style.rhythmId || 'rhythm:steady'), voice: { type: labelFor(blueprint.style.voice.typeId || 'voice:lead'), register: labelFor(blueprint.style.voice.registerId || 'register:mid'), texture: choices(blueprint.style.voice.textureIds), delivery: choices(blueprint.style.voice.deliveryIds) }, bass: traits('bass'), drums: traits('drums'), instrumentation: traits('instrument'), production: traits('production'), mix: traits('mix') },
    language: { theme: labelFor(blueprint.language.themeIds[0]?.id || 'theme:finding'), secondaryTheme: blueprint.language.themeIds[1] ? labelFor(blueprint.language.themeIds[1].id) : '', perspective: blueprint.language.perspective, register: labelFor(blueprint.language.registerId), motif: blueprint.language.motif, preferred: blueprint.language.preferredTerms.join(', '), avoided: blueprint.language.avoidedTerms.join(', '), dialect: labelFor(blueprint.language.dialect?.packId || 'dialect:standard'), dialectStrength: blueprint.language.dialect?.strength ?? 1 },
    structure: blueprint.sections.map(section => { const accepted = source.document.sections.find(current => current.sectionId === section.id)!; return { id: section.id, type: section.type, name: section.name ?? `Section ${blueprint.sections.indexOf(section) + 1}`, purpose: section.purpose, intensity: section.intensity, rhymeScheme: section.constraints.rhymeScheme ?? '', syllableRange: [...(section.constraints.syllableRange || [8, 12])] as [number, number], delivery: labelFor(section.constraints.deliveryId || 'delivery:melodic'), locked: accepted.locked, lines: accepted.lines.map(line => ({ id: line.id, text: line.text, locked: line.locked, authored: line.origin === 'authored' })) }; }), settings: { ignoredWarnings: [...source.ignoredWarnings] }, updatedAt: source.updatedAt };
  const state: EditorEngineState = { generationKeys: Object.fromEntries(blueprint.sections.map(section => [section.id, section.generationKey])), roles: Object.fromEntries(blueprint.sections.map(section => [section.id, section.role])), variations: clone(source.variations), recipes: clone(source.recipes), lines: Object.fromEntries(source.document.sections.flatMap(section => section.lines.map(line => [line.id, { origin: line.origin, textFingerprint: fingerprint(line.text), lockedRanges: clone(line.lockedRanges), annotations: clone(line.annotations), ...(line.recipeId ? { recipeId: line.recipeId } : {}) }]))), originalBlueprint: clone(blueprint), projectionBaseline: fromLegacyProject(project).blueprint };
  return { ...project, engineState: state };
}
export function toEnvelope(project: Project): ProjectEnvelope {
  const state = project.engineState || emptyEngineState(), adapted = fromLegacyProject(project, state);
  const result = decodeProject({ schemaVersion: 2, app: 'LyricLab', id: project.id, ...adapted, recipes: state.recipes, variations: state.variations, updatedAt: project.updatedAt, ignoredWarnings: project.settings.ignoredWarnings });
  if (result.status !== 'resolved') throw new Error(result.diagnostics.map(issue => issue.message).join('; '));
  return result.value;
}

/** A descriptive interchange object, with no editor authority or replay claims. */
export function projectSongSpec(envelope: ProjectEnvelope, snapshot: CatalogSnapshot = narrativeCatalog): SongSpec {
  const decoded = decodeProject(envelope); if (decoded.status !== 'resolved') throw new Error(decoded.diagnostics.map(issue => issue.message).join('; '));
  const source = decoded.value, blueprint = source.blueprint;
  const choice = (id: string, weight?: number) => ({ id, label: snapshot.choices.get(id)?.label || snapshot.genres.get(id)?.label || snapshot.traits.get(id)?.label || `Unavailable (${id})`, ...(weight === undefined ? {} : { weight }) });
  return { format: 'SongSpec', schemaVersion: 1, title: blueprint.title, concept: blueprint.concept,
    style: { genres: blueprint.style.genres.map(ref => choice(ref.id, ref.weight)), moods: blueprint.style.moods.map(ref => choice(ref.id, ref.weight)), ...(blueprint.style.bpm === undefined ? {} : { bpm: blueprint.style.bpm }), ...(blueprint.style.rhythmId ? { rhythm: choice(blueprint.style.rhythmId) } : {}), traits: blueprint.style.traitIds.map(id => ({ ...choice(id), category: { id: snapshot.traits.get(id)?.categoryId || 'unavailable', label: snapshot.traits.get(id)?.categoryId || 'Unavailable' } })), voice: { ...(blueprint.style.voice.typeId ? { type: choice(blueprint.style.voice.typeId) } : {}), ...(blueprint.style.voice.registerId ? { register: choice(blueprint.style.voice.registerId) } : {}), textures: blueprint.style.voice.textureIds.map(id => choice(id)), deliveries: blueprint.style.voice.deliveryIds.map(id => choice(id)) } },
    language: { themes: blueprint.language.themeIds.map(ref => choice(ref.id, ref.weight)), tones: blueprint.language.toneIds.map(id => choice(id)), perspective: blueprint.language.perspective, register: choice(blueprint.language.registerId), motif: blueprint.language.motif, preferredTerms: clone(blueprint.language.preferredTerms), avoidedTerms: clone(blueprint.language.avoidedTerms), ...(blueprint.language.dialect ? { dialect: { pack: choice(blueprint.language.dialect.packId), strength: blueprint.language.dialect.strength, mode: blueprint.language.dialect.mode, styleTags: snapshot.dialects.get(blueprint.language.dialect.packId)?.styleTags || [] } } : {}) },
    sections: blueprint.sections.map(section => ({ ...(section.name === undefined ? {} : { name: section.name }), id: section.id, type: section.type, role: section.role, purpose: section.purpose, intensity: section.intensity, lineCount: section.lineCount, ...(section.hookArchetype ? { hookArchetype: section.hookArchetype } : {}), constraints: { ...(section.constraints.rhymeScheme === undefined ? {} : { rhymeScheme: section.constraints.rhymeScheme }), ...(section.constraints.syllableRange === undefined ? {} : { syllableRange: clone(section.constraints.syllableRange) }), ...(section.constraints.deliveryId ? { delivery: choice(section.constraints.deliveryId) } : {}), ...(section.constraints.repetitionPreference ? { repetitionPreference: section.constraints.repetitionPreference } : {}) }, lyrics: source.document.sections.find(current => current.sectionId === section.id)!.lines.map(line => line.text) })), narrative: clone(blueprint.narrative) };
}

const replayProfiles = [
  { profile: narrativeProfile, catalog: narrativeCatalog, composer: narrativeComposer, narrativeReducer },
  { profile: createDefaultProfile(generationCatalog), catalog: generationCatalog, composer: legacyCandidateGenerator },
  { profile: legacyNarrativeProfile, catalog: legacyNarrativeCatalog, composer: narrativeComposer, narrativeReducer },
  { profile: createDefaultProfile(legacyGenerationCatalog), catalog: legacyGenerationCatalog, composer: legacyCandidateGenerator },
  { profile: createDefaultProfile(catalog), catalog, composer: legacyCandidateGenerator },
];
function profileKey(profile: ExecutionProfile): string { return fingerprint({ ...profile, packs: [...profile.packs].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) }); }
/** Replay uses the recipe's immutable baseline, never a current edited document. */
export function replayRecipe(recipe: ReplayRecipe): Resolution<LyricCandidate> {
  try {
    validateRecipeShape(recipe);
    const registered = replayProfiles.find(record => profileKey(record.profile) === profileKey(recipe.profile));
    if (!registered) return { status: 'missing-dependency', diagnostics: [diagnostic('missing-dependency', 'Exact historical algorithm/pack versions are unavailable; the recipe remains inspectable.', 'error')] };
    const inputs = recipe.inputs;
    const request: GenerationRequest = { blueprint: clone(inputs.blueprint), document: clone(inputs.baselineDocument), sectionId: inputs.sectionId, targetLineIds: [...inputs.targetLineIds], replacementPolicy: clone(inputs.replacementPolicy), evaluationPolicy: clone(inputs.evaluationPolicy), budget: clone(inputs.budget), profile: clone(recipe.profile), variation: recipe.variation };
    const generated = foundationCoordinator.generate(request, registered.catalog);
    if (generated.status !== 'ready') return { status: generated.status === 'exhausted' ? 'invalid-input' : generated.status, diagnostics: generated.status === 'exhausted' ? [diagnostic('invalid-input', 'Recorded accepted candidate cannot be reconstructed within its original budget.', 'error'), ...generated.diagnostics] : generated.diagnostics };
    let candidate = generated.candidates.find(entry => entry.candidate.ordinal === recipe.candidateOrdinal)?.candidate;
    if (!candidate) {
      // makeRecipe also accepts admissible attempts outside the displayed/ranked shortlist.
      // Capture composition using the same validated bounded coordinator and pinned profile.
      let captured: { candidate: LyricCandidate; context: GenerationContext } | undefined;
      const capturing = createGenerationCoordinator({ profiles: replayProfiles, composer: { compose(context, plan, random, ordinal) {
        const candidate = registered.composer.compose(context, plan, random, ordinal);
        if (ordinal === recipe.candidateOrdinal) captured = { candidate, context };
        return candidate;
      } } });
      const checked = capturing.generate(request, registered.catalog);
      required(checked.status === 'ready' && captured, 'Recorded attempt could not be composed.');
      candidate = clone(captured!.candidate);
      const context = captured!.context;
      if (request.blueprint.language.dialect) {
        const options = request.blueprint.language.dialect, pack = registered.catalog.dialects.get(options.packId)!;
        const original = request.document.sections.find(section => section.sectionId === request.sectionId)!;
        const provisional = candidateContextLines(candidate, context);
        const document = withRevision([{ ...original, lines: original.lines.map(line => ({ ...line, text: provisional.find(current => current.lineId === line.id)!.text, origin: candidate!.lines.some(update => update.targetLineId === line.id) ? 'generated' as const : line.origin, annotations: [] })) }]);
        const preview = dialectTransformer.preview(document, pack, options, { operation: 'dialect', authored: request.replacementPolicy.authored });
        required(!preview.diagnostics.some(issue => issue.severity === 'error'), 'Recorded dialect transformation is invalid.');
        candidate = { ...candidate, lines: candidate.lines.map(line => {
          let text = line.text;
          for (const edit of preview.edits.filter(edit => edit.lineId === line.targetLineId).sort((a, b) => b.range[0] - a.range[0])) text = text.slice(0, edit.range[0]) + edit.after + text.slice(edit.range[1]);
          return { ...line, text, annotations: text === line.text ? line.annotations : [] };
        }) };
      }
      const evaluation = candidateEvaluator.evaluate(candidate, context, textAnalyzer.analyze(candidateContextLines(candidate, context), registered.catalog.pronunciations));
      required(evaluation.admissible, 'Recorded candidate is inadmissible under its historical policy.');
    }
    required(outputFingerprint(candidate) === recipe.outputFingerprint, 'Historical output fingerprint does not match the reconstructed accepted candidate.');
    return { status: 'resolved', value: clone(candidate), diagnostics: [] };
  } catch (error) { return invalid(error); }
}
