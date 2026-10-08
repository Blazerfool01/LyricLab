/** Compile-time acceptance checks, included by tsc; this module is never executed. */
import type {
  CandidateEvaluator,
  CandidateGenerator,
  CandidateLine,
  DocumentApplicator,
  DocumentLine,
  DocumentPatch,
  GenerationContext,
  LyricCandidate,
  LyricDocument,
  PatchResult,
  PortableSection,
  ProjectEnvelope,
  ReplacementPolicy,
  SongBlueprint,
  SongSpec,
  TextAnalysis,
  ResolvedStyle,
  StyleCompiler,
  TemplateDefinition,
  TemplateEffectDeclaration,
  PortableConstraints,
  PortableDialect,
} from "./contracts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type Excludes<T, Keys extends PropertyKey> =
  Extract<keyof T, Keys> extends never ? true : false;

type CandidateLinesAreReadonly = Assert<Equal<LyricCandidate["lines"], readonly CandidateLine[]>>;
type DocumentLinesAreReadonly = Assert<Equal<LyricDocument["sections"][number]["lines"], readonly DocumentLine[]>>;
type CandidateTextIsReadonly = Assert<Equal<Pick<CandidateLine, "text">, Readonly<Pick<CandidateLine, "text">>>>;
type ComposerReturnsCandidate = Assert<Equal<ReturnType<CandidateGenerator["compose"]>, LyricCandidate>>;
type EvaluatorHasNoRandomSource = Assert<Equal<Parameters<CandidateEvaluator["evaluate"]>, [LyricCandidate, GenerationContext, TextAnalysis]>>;
type ComposerDoesNotScore = Assert<Excludes<LyricCandidate, "scores" | "admissible" | "diagnostics">>;
type ApplicatorOwnsAllPatches = Assert<Equal<Parameters<DocumentApplicator["apply"]>, [LyricDocument, DocumentPatch]>>;
type ApplicatorReportsProtectionAndStaleness = Assert<Equal<ReturnType<DocumentApplicator["apply"]>, PatchResult>>;
type BlueprintDoesNotContainEditorState = Assert<Excludes<SongBlueprint, "document" | "recipes" | "updatedAt" | "ignoredWarnings">>;
type EnvelopeRetainsBlueprint = Assert<Equal<ProjectEnvelope["blueprint"], SongBlueprint>>;
type InterchangeExcludesEditorAndReplayFields = Assert<Excludes<SongSpec, "document" | "recipes" | "revision" | "updatedAt" | "ignoredWarnings" | "rootSeed" | "profile">>;
type PortableSectionsExcludeProtectionAndGenerationIdentity = Assert<Excludes<PortableSection, "locked" | "authored" | "recipeId" | "generationKey">>;
type PolicyCannotBypassLocks = Assert<Excludes<ReplacementPolicy, "overrideLocks" | "replaceLocked">>;

type CompilerRequiresOnlyResolvedStyle = Assert<Equal<Parameters<StyleCompiler["compile"]>, [ResolvedStyle, "Compact" | "Detailed" | "Annotated"]>>;
type TemplateDeclaresEffects = Assert<Equal<TemplateDefinition["effects"], readonly TemplateEffectDeclaration[]>>;
type PortableCadenceIsDescriptive = Assert<Excludes<PortableConstraints, "deliveryId">>;
type PortableDialectRetainsMode = Assert<Equal<PortableDialect["mode"], "metadata" | "vocabulary" | "phonetic">>;

// Negative checks demonstrate that these boundaries reject mutable or coupled shapes.
// @ts-expect-error Candidate output must not expose mutable arrays.
type RejectMutableCandidateLines = Assert<Equal<LyricCandidate["lines"], CandidateLine[]>>;
// @ts-expect-error SongSpec is not a project editing envelope.
type RejectProjectAsSongSpec = Assert<Equal<SongSpec, ProjectEnvelope>>;
// @ts-expect-error Candidate composition is synchronous.
type RejectAsyncComposer = Assert<Equal<ReturnType<CandidateGenerator["compose"]>, Promise<LyricCandidate>>>;
