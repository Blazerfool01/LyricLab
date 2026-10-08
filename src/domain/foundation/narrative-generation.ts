import { catalog, generationCatalog, freeze, immutableView } from './catalogs';
import { createDefaultProfile, createGenerationCoordinator, defaultProfile, legacyCandidateGenerator } from './generation';
import { applyTemplateEffects, narrativeReducer } from './narrative';
import { fingerprint } from './randomness';
import type { CandidateGenerator, CatalogSnapshot, TemplateEffectDeclaration } from './contracts';

const motif = (id: string): TemplateEffectDeclaration => ({ kind: 'motif', motif: { kind: 'literal', value: id } });
const assertion = (id: string, predicateId: string, value: string): TemplateEffectDeclaration => ({ kind: 'assert', id, predicateId, subject: { kind: 'slot', slotId: 'narrator' }, value: { kind: 'literal', value }, polarity: 'positive', timeFrame: { kind: 'literal', value: 'present' } });
const claim: TemplateEffectDeclaration = { kind: 'goal', goal: { id: 'central-claim', description: 'Express the central theme claim', status: 'developed' } };
/** Metadata on existing explicit phrases only; no lexical inference or new content. */
export const effectManifest: Readonly<Record<string, readonly TemplateEffectDeclaration[]>> = freeze({
  'theme:finding:verse:1': [motif('theme:finding:object:1')],
  'theme:love:verse:1': [motif('theme:love:object:1'), assertion('leave-cup', 'leaves', 'coffee cup')],
  'theme:letting-go:verse:6': [motif('theme:letting-go:object:4'), assertion('set-key', 'places', 'old key')],
  'theme:ambition:verse:1': [motif('theme:ambition:object:1'), assertion('fill-notebook', 'fills', 'worn notebook')],
  'theme:home:verse:1': [motif('theme:home:object:3')],
  'legacy:statement:1': [claim], 'legacy:statement:4': [claim],
});
export const narrativeCatalog: CatalogSnapshot = freeze({ ...generationCatalog,
  templates: immutableView(generationCatalog.templates.all().map(template => ({ ...template, effects: effectManifest[template.id] || template.effects }))),
  packs: [...generationCatalog.packs, { id: 'narrative-metadata', version: '1.0.0', contentHash: fingerprint(effectManifest) }],
});
export const narrativeProfile = freeze({ ...defaultProfile, packs: narrativeCatalog.packs,
  algorithms: { ...defaultProfile.algorithms, composition: { id: 'annotated-pattern-composition', version: '1.0.0' }, narrative: { id: 'accepted-annotation-reduction', version: '1.0.0' }, selection: { id: 'bounded-candidate-search', version: '2.0.0' } },
});
export const narrativeComposer: CandidateGenerator = {
  compose(context, plan, random, ordinal) {
    // Roles choose a part of the existing bank; accepted motifs discourage repeated images.
    const shaped = { ...plan, editableSlots: plan.editableSlots.map(slot => {
      const roleIds = slot.templateIds.filter(id => !id.includes(':verse:') || (context.section.role === 'establish' ? Number(id.split(':').at(-1)) <= 4 : Number(id.split(':').at(-1)) > 4));
      const available = roleIds.length ? roleIds : slot.templateIds;
      const fresh = available.filter(id => !(effectManifest[id] || []).some(effect => effect.kind === 'motif' && effect.motif.kind === 'literal' && context.narrative.motifIds.includes(String(effect.motif.value))));
      return { ...slot, templateIds: fresh.length ? fresh : available };
    }) };
    const candidate = legacyCandidateGenerator.compose(context, shaped, random, ordinal);
    return { ...candidate, lines: candidate.lines.map((line, index) => {
      const template = context.catalog.templates.get(candidate.trace.templateIds[index])!;
      const delivery = shaped.editableSlots[index].constraints.deliveryId;
      // Clipping can remove the subject/action: never assert the complete phrase's semantics.
      if (['delivery:short', 'delivery:spacious'].includes(delivery || '') || ['Short / clipped', 'Dragged / spacious'].includes(context.catalog.choices.get(delivery || '')?.label || '')) return line;
      const pronoun = context.language.intent.perspective === 'second' ? 'you' : context.language.intent.perspective === 'third' ? 'them' : 'me';
      const text = line.text.replace(/beside me$/, `beside ${pronoun}`);
      // Explicit action declarations identify the narrator only in first-person realization.
      const effects = template.effects.filter(effect => effect.kind !== 'assert' || context.language.intent.perspective === 'first');
      const resolved = applyTemplateEffects(effects, { narrator: context.request.blueprint.narrative.narratorId }, text, `${candidate.id}:${line.targetLineId}`);
      if (resolved.status !== 'resolved') throw new Error(resolved.diagnostics.map(issue => issue.message).join('; '));
      return { ...line, text, annotations: resolved.value };
    }) };
  },
};
export const foundationCoordinator = createGenerationCoordinator({ profiles: [
  { profile: narrativeProfile, catalog: narrativeCatalog, composer: narrativeComposer, narrativeReducer },
  { profile: defaultProfile, catalog: generationCatalog },
  { profile: createDefaultProfile(catalog), catalog },
] });
