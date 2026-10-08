/** Deterministic fixtures for foundation tests; never imported by the application. */
import { catalog } from './catalogs';
import type { GenerationContext, LyricCandidate } from './contracts';

export function makeTestContext(texts: readonly string[] = ['I follow the light', 'I grow into the night']): GenerationContext {
  const section = { id: 'section-a', generationKey: 'stream-a', type: 'verse' as const, role: 'establish' as const, purpose: 'Establish the journey', lineCount: texts.length, intensity: 40, constraints: { syllableRange: [4, 10] as const, rhymeScheme: 'AA' } };
  const language = { themeIds: [{ id: 'theme:finding', weight: 1 }], toneIds: [], perspective: 'first' as const, registerId: 'language:poetic', motif: 'compass', preferredTerms: [], avoidedTerms: ['forbidden phrase'] };
  return {
    request: {
      blueprint: { id: 'blueprint-a', title: 'Compass', concept: 'Choose a direction', rootSeed: 2408, style: { genres: [], moods: [], voice: { textureIds: [], deliveryIds: [] }, traitIds: [] }, language, sections: [section], narrative: { narratorId: 'narrator-a', subjectIds: [], goals: [] } },
      document: { revision: 'revision-a', sections: [{ sectionId: section.id, locked: false, lines: texts.map((text, i) => ({ id: `line-${i + 1}`, text, origin: 'generated' as const, locked: false, lockedRanges: [], annotations: [] })) }] },
      sectionId: section.id,
      targetLineIds: texts.map((_, i) => `line-${i + 1}`),
      variation: 0,
      profile: { contractVersion: 1, algorithms: {}, packs: catalog.packs },
      replacementPolicy: { operation: 'generate', authored: 'preserve' },
      evaluationPolicy: { id: 'policy-a', version: '1.0.0', hardRuleIds: ['avoided', 'cliche'], scoreWeights: { cadence: 1, rhyme: 1 } },
      budget: { maxCandidates: 3, maxAttempts: 10 },
    },
    section,
    language: { intent: language, eligibleVocabularyIds: [], eligibleTemplateIds: [] },
    narrative: { assertions: [], goals: [], motifIds: [], provenance: {} },
    neighbors: [],
    catalog,
  };
}
export function makeTestCandidate(context: GenerationContext, texts: readonly string[] = ['I follow the light', 'I grow into the night']): LyricCandidate {
  return { id: 'candidate-a', ordinal: 0, lines: texts.map((text, i) => ({ slotId: `slot-${i + 1}`, targetLineId: context.request.targetLineIds[i], text, annotations: [] })), trace: { templateIds: [], vocabularyIds: [] } };
}
