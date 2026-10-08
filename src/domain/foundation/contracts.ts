/**
 * Approved Engine Foundation target boundaries, Stage A.
 * These types have no runtime implementation and do not change Project v1.
 * Validation, adapters, and engines are introduced in stages B–G.
 */
export type StableId = string;
/** New requests validate unsigned 32-bit integers; legacy coercion stays in its adapter. */
export type Seed = number;
export type Fingerprint = string;
export type TextRange = readonly [start: number, end: number];
export type Perspective = "first" | "second" | "third";
export type SectionRole = "establish" | "develop" | "challenge" | "reveal" | "resolve";
export type SectionKind = "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "custom";
export type HookArchetype = "title-drop" | "refrain" | "statement" | "question" | "contrast" | "chant" | "call-response";

export interface PackRef {
  readonly id: StableId;
  readonly version: string;
  readonly contentHash: Fingerprint;
}
export interface AlgorithmRef {
  readonly id: StableId;
  readonly version: string;
}
export interface ExecutionProfile {
  /** Historical future contracts remain inspectable even when runtime cannot execute them. */
  readonly contractVersion: number;
  readonly algorithms: Readonly<Record<string, AlgorithmRef>>;
  readonly packs: readonly PackRef[];
}
export interface WeightedRef {
  readonly id: StableId;
  readonly weight: number;
}
export interface StyleIntent {
  readonly genres: readonly WeightedRef[];
  readonly moods: readonly WeightedRef[];
  readonly bpm?: number;
  readonly rhythmId?: StableId;
  readonly voice: {
    readonly typeId?: StableId;
    readonly registerId?: StableId;
    readonly textureIds: readonly StableId[];
    readonly deliveryIds: readonly StableId[];
  };
  readonly traitIds: readonly StableId[];
}
export interface LanguageIntent {
  readonly themeIds: readonly WeightedRef[];
  readonly toneIds: readonly StableId[];
  readonly perspective: Perspective;
  readonly registerId: StableId;
  readonly motif: string;
  readonly preferredTerms: readonly string[];
  readonly avoidedTerms: readonly string[];
  readonly dialect?: DialectOptions;
}
export interface SectionConstraints {
  readonly rhymeScheme?: string;
  readonly syllableRange?: readonly [number, number];
  readonly deliveryId?: StableId;
  readonly repetitionPreference?: "low" | "balanced" | "high";
}
export interface SectionIntent {
  readonly name?: string;
  readonly id: StableId;
  readonly generationKey: StableId;
  readonly type: SectionKind;
  readonly role: SectionRole;
  readonly purpose: string;
  readonly lineCount: number;
  readonly intensity: number;
  readonly hookArchetype?: HookArchetype;
  readonly constraints: SectionConstraints;
}
export interface NarrativeIntent {
  readonly narratorId: StableId;
  readonly subjectIds: readonly StableId[];
  readonly goals: readonly NarrativeGoal[];
}
export interface SongBlueprint {
  readonly id: StableId;
  readonly title: string;
  readonly concept: string;
  readonly rootSeed: Seed;
  readonly style: StyleIntent;
  readonly language: LanguageIntent;
  readonly sections: readonly SectionIntent[];
  readonly narrative: NarrativeIntent;
}

export interface GenreDefinition {
  readonly id: StableId;
  readonly label: string;
  readonly familyId: StableId;
  readonly traitIds: readonly StableId[];
  readonly bpmRange: readonly [number, number];
}
export interface TraitDefinition {
  readonly id: StableId;
  readonly label: string;
  readonly categoryId: StableId;
  readonly excludes: readonly StableId[];
}
export interface VocabularyEntry {
  readonly id: StableId;
  readonly text: string;
  readonly kind: "action" | "object" | "location" | "state" | "sensory";
  readonly themeIds: readonly StableId[];
  readonly toneIds: readonly StableId[];
  readonly grammar: Readonly<Record<string, string>>;
  readonly pronunciationId?: StableId;
}
export interface TemplateDefinition {
  readonly id: StableId;
  readonly roles: readonly SectionRole[];
  readonly archetypes: readonly HookArchetype[];
  readonly pattern: string;
  readonly slots: Readonly<Record<string, VocabularyEntry["kind"]>>;
  readonly effects: readonly TemplateEffectDeclaration[];
}
export interface PronunciationEntry {
  readonly id: StableId;
  readonly token: string;
  readonly locale: string;
  readonly syllables: number;
  readonly phonemes: readonly string[];
}
/** Indexed views are synchronous, side-effect-free, and return stable ID order. */
export interface CatalogView<T> {
  get(id: StableId): T | undefined;
  all(): readonly T[];
}
export interface ChoiceDefinition {
  readonly claim?: string;
  readonly id: StableId;
  readonly label: string;
  readonly category: string;
  readonly range?: readonly [number, number];
}
export interface CatalogSnapshot {
  readonly choices: CatalogView<ChoiceDefinition>;
  readonly packs: readonly PackRef[];
  readonly genres: CatalogView<GenreDefinition>;
  readonly traits: CatalogView<TraitDefinition>;
  readonly vocabulary: CatalogView<VocabularyEntry>;
  readonly templates: CatalogView<TemplateDefinition>;
  readonly pronunciations: CatalogView<PronunciationEntry>;
  readonly dialects: CatalogView<DialectPack>;
}
export interface ResolvedChoice {
  readonly id: StableId;
  readonly label: string;
}
export interface ResolvedWeightedChoice extends ResolvedChoice {
  readonly weight: number;
}
export interface ResolvedVoice {
  readonly type?: ResolvedChoice;
  readonly register?: ResolvedChoice;
  readonly textures: readonly ResolvedChoice[];
  readonly deliveries: readonly ResolvedChoice[];
}
export interface ResolvedStyle {
  readonly genres: readonly ResolvedWeightedChoice[];
  readonly moods: readonly ResolvedWeightedChoice[];
  readonly rhythm?: ResolvedChoice;
  readonly traits: readonly TraitDefinition[];
  readonly bpm?: number;
  readonly voice: ResolvedVoice;
  readonly diagnostics: readonly Diagnostic[];
}
export interface ResolvedLanguageProfile {
  readonly intent: LanguageIntent;
  readonly eligibleVocabularyIds: readonly StableId[];
  readonly eligibleTemplateIds: readonly StableId[];
}

export interface NarrativeGoal {
  readonly id: StableId;
  readonly description: string;
  readonly status: "open" | "developed" | "challenged" | "resolved";
}
export interface SemanticAssertion {
  readonly id: StableId;
  readonly subjectId: StableId;
  readonly predicateId: StableId;
  readonly value: string | number | boolean;
  readonly polarity: "positive" | "negative";
  readonly timeFrameId: StableId;
}
/** Slot references are resolved during composition; declarations do not mutate state. */
export type TemplateBinding =
  | { readonly kind: "literal"; readonly value: string | number | boolean }
  | { readonly kind: "slot"; readonly slotId: StableId };
export type TemplateEffectDeclaration =
  | {
      readonly kind: "assert";
      readonly id: StableId;
      readonly subject: TemplateBinding;
      readonly predicateId: StableId;
      readonly value: TemplateBinding;
      readonly polarity: SemanticAssertion["polarity"];
      readonly timeFrame: TemplateBinding;
    }
  | { readonly kind: "goal"; readonly goal: NarrativeGoal }
  | { readonly kind: "motif"; readonly motif: TemplateBinding };
export type SemanticEffect =
  | { readonly kind: "assert"; readonly assertion: SemanticAssertion }
  | { readonly kind: "goal"; readonly goal: NarrativeGoal }
  | { readonly kind: "motif"; readonly motifId: StableId };
export interface SemanticAnnotation {
  readonly id: StableId;
  readonly evidence: "user-confirmed" | "template-declared";
  readonly textFingerprint: Fingerprint;
  readonly effect: SemanticEffect;
}
export interface NarrativeState {
  readonly assertions: readonly SemanticAssertion[];
  readonly goals: readonly NarrativeGoal[];
  readonly motifIds: readonly StableId[];
  readonly provenance: Readonly<Record<StableId, readonly StableId[]>>;
}
export interface DocumentLine {
  readonly id: StableId;
  readonly text: string;
  readonly origin: "authored" | "generated" | "unknown";
  readonly locked: boolean;
  readonly lockedRanges: readonly TextRange[];
  readonly annotations: readonly SemanticAnnotation[];
  readonly recipeId?: StableId;
}
export interface DocumentSection {
  readonly sectionId: StableId;
  readonly locked: boolean;
  readonly lines: readonly DocumentLine[];
}
export interface LyricDocument {
  readonly revision: Fingerprint;
  readonly sections: readonly DocumentSection[];
}
export interface ReplacementPolicy {
  readonly operation: "generate" | "dialect";
  /** Explicit replacement may include authored text, but never bypasses locks. */
  readonly authored: "preserve" | "replace-explicitly";
}
export interface SearchBudget {
  readonly maxCandidates: number;
  readonly maxAttempts: number;
}
export interface EvaluationPolicy {
  readonly id: StableId;
  readonly version: string;
  readonly hardRuleIds: readonly StableId[];
  readonly scoreWeights: Readonly<Record<StableId, number>>;
}
export interface GenerationRequest {
  readonly blueprint: SongBlueprint;
  readonly document: LyricDocument;
  readonly sectionId: StableId;
  readonly targetLineIds: readonly StableId[];
  readonly variation: number;
  readonly profile: ExecutionProfile;
  readonly replacementPolicy: ReplacementPolicy;
  readonly evaluationPolicy: EvaluationPolicy;
  readonly budget: SearchBudget;
}
export interface ContextLine {
  /** Provisional composition provenance; protection is always derived from the document. */
  readonly origin?: "generated" | "context";
  readonly lineId: StableId;
  readonly sectionId: StableId;
  readonly text: string;
  readonly protected: boolean;
}
export interface GenerationContext {
  readonly request: GenerationRequest;
  readonly section: SectionIntent;
  readonly language: ResolvedLanguageProfile;
  readonly narrative: NarrativeState;
  readonly neighbors: readonly ContextLine[];
  readonly catalog: CatalogSnapshot;
}
export interface LinePlan {
  readonly slotId: StableId;
  readonly targetLineId: StableId;
  readonly role: SectionRole;
  readonly templateIds: readonly StableId[];
  readonly constraints: SectionConstraints;
}
export interface SectionPlan {
  readonly sectionId: StableId;
  readonly editableSlots: readonly LinePlan[];
  readonly protectedLines: readonly DocumentLine[];
}
/** Each source belongs to one deterministic stream and one candidate attempt. */
export interface RandomSource { next(): number; }
export interface RandomFactory {
  stream(rootSeed: Seed, namespace: readonly string[]): RandomSource;
}
export interface CandidateLine {
  readonly slotId: StableId;
  readonly targetLineId: StableId;
  readonly text: string;
  readonly annotations: readonly SemanticAnnotation[];
}
/** Composer output has no scores and cannot apply itself to a document. */
export interface LyricCandidate {
  readonly id: StableId;
  readonly ordinal: number;
  readonly lines: readonly CandidateLine[];
  readonly trace: {
    readonly templateIds: readonly StableId[];
    readonly vocabularyIds: readonly StableId[];
  };
}
export interface Diagnostic {
  readonly ruleId: StableId;
  readonly severity: "info" | "warning" | "error";
  readonly origin: "generated" | "protected" | "context";
  readonly lineIds: readonly StableId[];
  readonly message: string;
}
export interface LineMeasurement {
  readonly textFingerprint: Fingerprint;
  readonly lineId: StableId;
  readonly syllables: number;
  readonly confidence: "known" | "estimated" | "unknown";
  readonly endRhymeKey?: StableId;
}
export interface RhymeRelation {
  readonly lineIds: readonly [StableId, StableId];
  readonly kind: "exact" | "slant" | "unknown";
  readonly confidence: number;
}
export interface TextAnalysis {
  readonly lines: readonly LineMeasurement[];
  readonly rhymes: readonly RhymeRelation[];
  readonly repeatedTerms: Readonly<Record<string, number>>;
}
export interface CandidateEvaluation {
  readonly candidateId: StableId;
  readonly admissible: boolean;
  readonly scores: Readonly<Record<StableId, number>>;
  readonly diagnostics: readonly Diagnostic[];
}
export interface EvaluatedCandidate {
  readonly candidate: LyricCandidate;
  readonly evaluation: CandidateEvaluation;
}
export type GenerationResult =
  | { readonly status: "ready"; readonly candidates: readonly EvaluatedCandidate[]; readonly selectedCandidateId: StableId }
  | { readonly status: "exhausted" | "invalid-input" | "missing-dependency"; readonly diagnostics: readonly Diagnostic[] };
export interface CandidateGenerator {
  compose(context: GenerationContext, plan: SectionPlan, random: RandomSource, ordinal: number): LyricCandidate;
}
export interface TextAnalyzer {
  analyze(lines: readonly ContextLine[], pronunciations: CatalogView<PronunciationEntry>): TextAnalysis;
}
export interface CandidateEvaluator {
  evaluate(candidate: LyricCandidate, context: GenerationContext, analysis: TextAnalysis): CandidateEvaluation;
}

/** Minimal original inputs must be retained: hashes alone cannot reconstruct replay. */
export interface ReplayInputs {
  readonly blueprint: SongBlueprint;
  readonly baselineDocument: LyricDocument;
  readonly sectionId: StableId;
  readonly targetLineIds: readonly StableId[];
  readonly replacementPolicy: ReplacementPolicy;
  readonly evaluationPolicy: EvaluationPolicy;
  readonly budget: SearchBudget;
}
export interface ReplayRecipe {
  readonly id: StableId;
  readonly inputs: ReplayInputs;
  readonly inputFingerprint: Fingerprint;
  readonly profile: ExecutionProfile;
  readonly rootSeed: Seed;
  readonly generationKey: StableId;
  readonly variation: number;
  readonly candidateOrdinal: number;
  readonly outputFingerprint: Fingerprint;
}
export interface CandidatePatch {
  readonly kind: "candidate";
  readonly expectedRevision: Fingerprint;
  readonly sectionId: StableId;
  readonly replacementPolicy: ReplacementPolicy;
  readonly candidate: LyricCandidate;
  readonly recipe: ReplayRecipe;
}
export type PatchResult =
  | { readonly status: "applied"; readonly document: LyricDocument }
  | { readonly status: "stale" | "protected" | "invalid-patch"; readonly diagnostics: readonly Diagnostic[] };
export interface TransformationPatch {
  readonly kind: "transformation";
  readonly replacementPolicy: ReplacementPolicy;
  readonly preview: TransformationPreview;
}
export type DocumentPatch = CandidatePatch | TransformationPatch;
export interface DocumentApplicator {
  apply(document: LyricDocument, patch: DocumentPatch): PatchResult;
}

export interface DialectOptions {
  readonly packId: StableId;
  readonly strength: 1 | 2 | 3 | 4 | 5;
  readonly mode: "metadata" | "vocabulary" | "phonetic";
}
export interface DialectRule {
  readonly id: StableId;
  readonly kind: "vocabulary" | "grammar" | "phonetic";
  readonly source: string;
  readonly replacement: string;
  readonly minimumStrength: DialectOptions["strength"];
}
export interface DialectPack {
  readonly id: StableId;
  readonly rules: readonly DialectRule[];
  readonly styleTags: readonly string[];
}
export interface TransformationEdit {
  readonly lineId: StableId;
  readonly range: TextRange;
  readonly before: string;
  readonly after: string;
  readonly ruleId: StableId;
}
export interface TransformationPreview {
  readonly expectedRevision: Fingerprint;
  readonly edits: readonly TransformationEdit[];
  readonly pronunciationHints: readonly PronunciationEntry[];
  readonly diagnostics: readonly Diagnostic[];
}
export interface DialectTransformer {
  preview(document: LyricDocument, pack: DialectPack, options: DialectOptions, policy: ReplacementPolicy): TransformationPreview;
}

/** Canonical editing envelope; editor compatibility views are never serialized. */
export interface ProjectEnvelope {
  readonly schemaVersion: 2;
  readonly app: "LyricLab";
  readonly id: StableId;
  readonly blueprint: SongBlueprint;
  readonly document: LyricDocument;
  readonly recipes: readonly ReplayRecipe[];
  readonly updatedAt: string;
  readonly ignoredWarnings: readonly StableId[];
  readonly variations: Readonly<Record<StableId, number>>;
}
export interface PortableChoice {
  readonly id: StableId;
  readonly label: string;
  readonly weight?: number;
}
export interface PortableTrait extends PortableChoice {
  readonly category: PortableChoice;
}
export interface PortableVoice {
  readonly type?: PortableChoice;
  readonly register?: PortableChoice;
  readonly textures: readonly PortableChoice[];
  readonly deliveries: readonly PortableChoice[];
}
export interface PortableDialect {
  readonly pack: PortableChoice;
  readonly strength: DialectOptions["strength"];
  readonly mode: DialectOptions["mode"];
  readonly styleTags: readonly string[];
}
export interface PortableConstraints {
  readonly rhymeScheme?: string;
  readonly syllableRange?: readonly [number, number];
  readonly delivery?: PortableChoice;
  readonly repetitionPreference?: SectionConstraints["repetitionPreference"];
}
export interface PortableSection {
  readonly name?: string;
  readonly id: StableId;
  readonly type: SectionKind;
  readonly role: SectionRole;
  readonly purpose: string;
  readonly intensity: number;
  readonly lineCount: number;
  readonly constraints: PortableConstraints;
  readonly hookArchetype?: HookArchetype;
  readonly lyrics: readonly string[];
}
/** Interchange excludes locks, revisions, recipes, warning suppression, and timestamps. */
export interface SongSpec {
  readonly format: "SongSpec";
  readonly schemaVersion: 1;
  readonly title: string;
  readonly concept: string;
  readonly style: {
    readonly genres: readonly PortableChoice[];
    readonly moods: readonly PortableChoice[];
    readonly bpm?: number;
    readonly rhythm?: PortableChoice;
    readonly traits: readonly PortableTrait[];
    readonly voice: PortableVoice;
  };
  readonly language: {
    readonly themes: readonly PortableChoice[];
    readonly tones: readonly PortableChoice[];
    readonly perspective: Perspective;
    readonly register: PortableChoice;
    readonly motif: string;
    readonly preferredTerms: readonly string[];
    readonly avoidedTerms: readonly string[];
    readonly dialect?: PortableDialect;
  };
  readonly sections: readonly PortableSection[];
  readonly narrative: NarrativeIntent;
}

export type Resolution<T> =
  | { readonly status: "resolved"; readonly value: T; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: "invalid-input" | "missing-dependency"; readonly diagnostics: readonly Diagnostic[] };
export interface StyleResolver {
  resolve(intent: StyleIntent, catalog: CatalogSnapshot, random: RandomSource): Resolution<ResolvedStyle>;
}
export interface StyleCompiler {
  compile(style: ResolvedStyle, format: "Compact" | "Detailed" | "Annotated"): string;
}
export interface LanguageResolver {
  resolve(intent: LanguageIntent, catalog: CatalogSnapshot): Resolution<ResolvedLanguageProfile>;
}
export interface StructurePlanner {
  plan(context: GenerationContext): Resolution<SectionPlan>;
}
export interface NarrativeReducer {
  derive(blueprint: SongBlueprint, document: LyricDocument, throughSectionId: StableId): Resolution<NarrativeState>;
}
export interface ConstraintEvaluator {
  evaluate(analysis: TextAnalysis, context: GenerationContext): readonly Diagnostic[];
}
export interface GenerationCoordinator {
  generate(request: GenerationRequest, catalog: CatalogSnapshot): GenerationResult;
}
