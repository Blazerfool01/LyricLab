/** Pure compatibility adapter. The editor is a view; this module does not persist it. */
import type { Project } from '../types';
import type { DocumentLine, ReplayRecipe, SectionRole, SemanticAnnotation, SongBlueprint, TextRange } from './contracts';
import { generationCatalog } from './catalogs';
import { withRevision } from './editing';
import { fingerprint } from './randomness';
export interface EditorEngineState {
  readonly generationKeys: Readonly<Record<string,string>>;
  readonly variations: Readonly<Record<string,number>>;
  readonly roles: Readonly<Record<string,SectionRole>>;
  readonly recipes: readonly ReplayRecipe[];
  readonly lines: Readonly<Record<string,{
    readonly origin: DocumentLine['origin'];
    readonly lockedRanges: readonly TextRange[];
    readonly annotations: readonly SemanticAnnotation[];
    readonly recipeId?: string;
  }>>;
}
export const emptyEngineState = (): EditorEngineState => ({generationKeys:{},variations:{},roles:{},recipes:[],lines:{}});
export function referenceFor(category:string,label:string):string {
  const existing=generationCatalog.choices.get(label);
  if(existing?.category===category || label.startsWith(`${category}:`) || label.startsWith(`unavailable:${category}:`)) return label;
  return generationCatalog.choices.all().find(c=>c.category===category&&c.label===label)?.id || `unavailable:${category}:${label}`;
}
export function labelFor(id:string):string {
  return generationCatalog.choices.get(id)?.label || (id.startsWith('unavailable:') ? id.split(':').slice(2).join(':') : id);
}
const terms=(value:string)=>value.split(',').map(x=>x.trim()).filter(Boolean);
export function fromLegacyProject(project:Project,state:EditorEngineState=emptyEngineState()) {
  const roleFor=(type:string,index:number):SectionRole=>type==='intro'||(type==='verse'&&index===project.structure.findIndex(s=>s.type==='verse'))?'establish':type==='bridge'?'reveal':type==='outro'||type==='chorus'?'resolve':type==='pre-chorus'?'challenge':'develop';
  const blueprint:SongBlueprint={
    id:project.id,title:project.title,concept:project.concept,rootSeed:project.seed>>>0,
    style:{genres:project.style.genres.map(g=>({...g})),moods:project.style.moods.map(m=>({...m,id:referenceFor('mood',m.id)})),bpm:project.style.bpm,rhythmId:referenceFor('rhythm',project.style.rhythm),voice:{typeId:referenceFor('voice',project.style.voice.type),registerId:referenceFor('register',project.style.voice.register),textureIds:project.style.voice.texture.map(x=>referenceFor('texture',x)),deliveryIds:project.style.voice.delivery.map(x=>referenceFor('delivery',x))},traitIds:([['instrument',project.style.instrumentation],['production',project.style.production],['drums',project.style.drums],['bass',project.style.bass],['mix',project.style.mix]] as const).flatMap(([category,values])=>values.map(x=>referenceFor(category,x)))},
    language:{themeIds:[{id:referenceFor('theme',project.language.theme),weight:1},...(project.language.secondaryTheme && project.language.secondaryTheme!==project.language.theme?[{id:referenceFor('theme',project.language.secondaryTheme),weight:0.35}]:[])],toneIds:project.style.moods.map(m=>referenceFor('mood',m.id)),perspective:project.language.perspective,registerId:referenceFor('language',project.language.register),motif:project.language.motif,preferredTerms:terms(project.language.preferred),avoidedTerms:terms(project.language.avoided),dialect:{packId:referenceFor('dialect',project.language.dialect),strength:project.language.dialectStrength as 1|2|3|4|5,mode:project.language.dialectStrength===1?'metadata':project.language.dialectStrength<4?'vocabulary':'phonetic'}},
    sections:project.structure.map((section,index)=>({id:section.id,name:section.name,generationKey:state.generationKeys[section.id]||section.id,type:section.type,role:state.roles[section.id]||roleFor(section.type,index),purpose:section.purpose,lineCount:section.lines.length,intensity:section.intensity,constraints:{rhymeScheme:section.rhymeScheme,syllableRange:[...section.syllableRange] as [number,number],deliveryId:referenceFor('delivery',section.delivery)}})),
    narrative:{narratorId:'narrator',subjectIds:[],goals:[]},
  };
  const document=withRevision(project.structure.map(section=>({sectionId:section.id,locked:section.locked,lines:section.lines.map(line=>{
    const retained=state.lines[line.id];
    return {id:line.id,text:line.text,origin:line.authored?'authored' as const:retained?.origin||'generated' as const,locked:line.locked,lockedRanges:retained?.lockedRanges||[],annotations:(retained?.annotations||[]).filter(a=>a.textFingerprint===fingerprint(line.text)),...(retained?.recipeId?{recipeId:retained.recipeId}:{})};
  })})));
  return {blueprint,document};
}
