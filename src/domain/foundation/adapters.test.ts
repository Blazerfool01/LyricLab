import {describe,it,expect} from 'vitest';
import fixtures from '../fixtures/legacy-v0.1.json';
import type {Project} from '../types';
import {fromLegacyProject,emptyEngineState,referenceFor,labelFor} from './adapters';
import {fingerprint} from './randomness';
import {generationCatalog,legacyGenerationCatalog,catalog} from './catalogs';
const project=fixtures.input.project as unknown as Project;
describe('legacy blueprint/document adapter',()=>{
  it('maps IDs and roles without changing accepted text or input',()=>{
    const before=structuredClone(project);
    const {blueprint,document}=fromLegacyProject(project);
    expect(project).toEqual(before);
    expect(blueprint.rootSeed).toBe(project.seed);
    expect(blueprint.style.rhythmId).toBe('rhythm:steady');
    expect(blueprint.language.themeIds[0].id).toBe('theme:finding');
    expect(blueprint.sections[0].role).toBe('establish');
    expect(blueprint.sections[0].name).toBe(project.structure[0].name);
    expect(document.sections.flatMap(s=>s.lines.map(l=>l.text))).toEqual(project.structure.flatMap(s=>s.lines.map(l=>l.text)));
    expect(document.revision).toBe(fingerprint(document.sections));
  });
  it('preserves section and line locks and authored text origin',()=>{
    const changed={...project,structure:project.structure.map(s=>({...s,locked:true,lines:s.lines.map(l=>({...l,locked:true,authored:true}))}))};
    const doc=fromLegacyProject(changed).document;
    expect(doc.sections.every(s=>s.locked&&s.lines.every(l=>l.locked&&l.origin==='authored'))).toBe(true);
  });
  it('retains independent generation keys and unknown-origin protection metadata',()=>{
    const section=project.structure[0],line=section.lines[0];
    const state={...emptyEngineState(),generationKeys:{[section.id]:'persistent-key'},lines:{[line.id]:{origin:'unknown' as const,lockedRanges:[[0,2] as const],annotations:[]}}};
    const adapted=fromLegacyProject({...project,structure:[{...section,lines:[{...line,authored:false}]}]},state);
    expect(adapted.blueprint.sections[0].generationKey).toBe('persistent-key');
    expect(adapted.document.sections[0].lines[0].origin).toBe('unknown');
    expect(adapted.document.sections[0].lines[0].lockedRanges).toEqual([[0,2]]);
  });
  it('preserves unknown stable references and round-trips legacy unknown labels',()=>{
    expect(referenceFor('delivery','delivery:uninstalled')).toBe('delivery:uninstalled');
    expect(referenceFor('instrument','Rare synth')).toBe('unavailable:instrument:Rare synth');
    expect(labelFor('unavailable:instrument:Rare synth')).toBe('Rare synth');
  });
  it('normalizes a repeated secondary theme without duplicate semantic IDs',()=>{
    const result=fromLegacyProject({...project,language:{...project.language,secondaryTheme:project.language.theme}});
    expect(result.blueprint.language.themeIds).toHaveLength(1);
  });
  it('keeps the base pack immutable when adding extracted legacy claims',()=>{
    expect(catalog.packs[0].contentHash).toBe('fnv1a-v1-7e737857');
    expect(catalog.choices.get('theme:finding')?.claim).toBeUndefined();
    expect(generationCatalog.choices.get('theme:finding')?.claim).toBe('I can be uncertain and still go');
    expect(legacyGenerationCatalog.packs.map(p=>p.id)).toEqual(['legacy-v0.1','legacy-claims']);
    expect(legacyGenerationCatalog.packs[0].contentHash).toBe(catalog.packs[0].contentHash);
    expect(generationCatalog.packs.map(p=>p.id)).toEqual(['legacy-v0.1','genre-style-expansion-v1','legacy-claims']);
    expect(generationCatalog.choices.get('mood:chill')?.label).toBe('Chill');
  });
});
