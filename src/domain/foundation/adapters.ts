/** Pure compatibility adapter. The editor is a view; this module does not persist it. */
import type { Project } from '../types';
import type { DocumentLine, ReplayRecipe, SectionRole, SemanticAnnotation, SongBlueprint, TextRange } from './contracts';
import { generationCatalog } from './catalogs';
import { withRevision } from './editing';
import { fingerprint } from './randomness';
export interface EditorEngineState {
  readonly originalBlueprint?: SongBlueprint;
  readonly projectionBaseline?: SongBlueprint;
  readonly generationKeys: Readonly<Record<string,string>>;
  readonly variations: Readonly<Record<string,number>>;
  readonly roles: Readonly<Record<string,SectionRole>>;
  readonly recipes: readonly ReplayRecipe[];
  readonly lines: Readonly<Record<string,{
    readonly textFingerprint?: string;
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
const own=<T>(record:Readonly<Record<string,T>>,key:string):T|undefined=>Object.prototype.hasOwnProperty.call(record,key)?record[key]:undefined;
export function fromLegacyProject(project:Project,state:EditorEngineState=emptyEngineState()) {
  const roleFor=(type:string,index:number):SectionRole=>type==='intro'||(type==='verse'&&index===project.structure.findIndex(s=>s.type==='verse'))?'establish':type==='bridge'?'reveal':type==='outro'||type==='chorus'?'resolve':type==='pre-chorus'?'challenge':'develop';
  const blueprint:SongBlueprint={
    id:project.id,title:project.title,concept:project.concept,rootSeed:project.seed>>>0,
    style:{genres:project.style.genres.map(g=>({...g})),moods:project.style.moods.map(m=>({...m,id:referenceFor('mood',m.id)})),bpm:project.style.bpm,rhythmId:referenceFor('rhythm',project.style.rhythm),voice:{typeId:referenceFor('voice',project.style.voice.type),registerId:referenceFor('register',project.style.voice.register),textureIds:project.style.voice.texture.map(x=>referenceFor('texture',x)),deliveryIds:project.style.voice.delivery.map(x=>referenceFor('delivery',x))},traitIds:([['instrument',project.style.instrumentation],['production',project.style.production],['drums',project.style.drums],['bass',project.style.bass],['mix',project.style.mix]] as const).flatMap(([category,values])=>values.map(x=>referenceFor(category,x)))},
    language:{themeIds:[{id:referenceFor('theme',project.language.theme),weight:1},...(project.language.secondaryTheme && project.language.secondaryTheme!==project.language.theme?[{id:referenceFor('theme',project.language.secondaryTheme),weight:0.35}]:[])],toneIds:project.style.moods.map(m=>referenceFor('mood',m.id)),perspective:project.language.perspective,registerId:referenceFor('language',project.language.register),motif:project.language.motif,preferredTerms:terms(project.language.preferred),avoidedTerms:terms(project.language.avoided),dialect:{packId:referenceFor('dialect',project.language.dialect),strength:project.language.dialectStrength as 1|2|3|4|5,mode:project.language.dialectStrength===1?'metadata':project.language.dialectStrength<4?'vocabulary':'phonetic'}},
    sections:project.structure.map((section,index)=>({id:section.id,name:section.name,generationKey:own(state.generationKeys,section.id)||section.id,type:section.type,role:own(state.roles,section.id)||roleFor(section.type,index),purpose:section.purpose,lineCount:section.lines.length,intensity:section.intensity,constraints:{rhymeScheme:section.rhymeScheme,syllableRange:[...section.syllableRange] as [number,number],deliveryId:referenceFor('delivery',section.delivery)}})),
    narrative:{narratorId:'narrator',subjectIds:[],goals:[]},
  };
  const document=withRevision(project.structure.map(section=>({sectionId:section.id,locked:section.locked,lines:section.lines.map(line=>{
    const retained=own(state.lines,line.id);
    const stale=retained?.textFingerprint!==undefined&&retained.textFingerprint!==fingerprint(line.text);
    return {id:line.id,text:line.text,origin:line.authored?'authored' as const:retained?.origin||(line.text.trim()?'unknown' as const:'generated' as const),locked:line.locked||(stale&&!!retained?.lockedRanges.length),lockedRanges:stale?[]:retained?.lockedRanges||[],annotations:(retained?.annotations||[]).filter(a=>a.textFingerprint===fingerprint(line.text)),...(retained?.recipeId?{recipeId:retained.recipeId}:{})};
  })})));
  return {blueprint:retainUneditedBlueprint(blueprint,state),document};
}

/** Compare against the actual projection, never against lossy reconstructed original values. */
function retainUneditedBlueprint(current:SongBlueprint,state:EditorEngineState):SongBlueprint {
  const original=state.originalBlueprint,baseline=state.projectionBaseline;
  if(!original||!baseline) return current;
  const same=(a:unknown,b:unknown)=>a===undefined||b===undefined?a===b:fingerprint(a)===fingerprint(b);
  const keep=<T>(value:T,projected:T,retained:T):T=>same(value,projected)?retained:value;
  const traitCategory=(ref:string)=>generationCatalog.traits.get(ref)?.categoryId||generationCatalog.choices.get(ref)?.category||(ref.startsWith('unavailable:')?ref.split(':')[1]:ref.split(':')[0]);
  const editorCategory=(ref:string)=>['instrument','production','drums','bass','mix'].includes(traitCategory(ref))?traitCategory(ref):'instrument';
  const traitIds=same(current.style.traitIds,baseline.style.traitIds)?original.style.traitIds:['instrument','production','drums','bass','mix'].flatMap(category=>{
    const selected=current.style.traitIds.filter(ref=>editorCategory(ref)===category),projected=baseline.style.traitIds.filter(ref=>editorCategory(ref)===category);
    return same(selected,projected)?original.style.traitIds.filter(ref=>editorCategory(ref)===category):selected;
  });
  const changedThemes=[...current.language.themeIds.map((theme,i)=>same(theme,baseline.language.themeIds[i])&&original.language.themeIds[i]?original.language.themeIds[i]:theme),...original.language.themeIds.slice(2)];
  const mergedThemes=new Map<string,{id:string;weight:number}>();
  for(const theme of changedThemes) mergedThemes.set(theme.id,{...theme,weight:(mergedThemes.get(theme.id)?.weight||0)+theme.weight});
  const style={...original.style,...current.style,
    genres:keep(current.style.genres,baseline.style.genres,original.style.genres),moods:keep(current.style.moods,baseline.style.moods,original.style.moods),
    voice:{...original.style.voice,...current.style.voice,textureIds:keep(current.style.voice.textureIds,baseline.style.voice.textureIds,original.style.voice.textureIds),deliveryIds:keep(current.style.voice.deliveryIds,baseline.style.voice.deliveryIds,original.style.voice.deliveryIds)},
    traitIds,
  };
  for(const key of ['bpm','rhythmId'] as const) if(same(current.style[key],baseline.style[key])) { if(original.style[key]===undefined) delete style[key]; else Object.assign(style,{[key]:original.style[key]}); }
  for(const key of ['typeId','registerId'] as const) if(same(current.style.voice[key],baseline.style.voice[key])) { if(original.style.voice[key]===undefined) delete style.voice[key]; else Object.assign(style.voice,{[key]:original.style.voice[key]}); }
  const language={...original.language,...current.language,
    themeIds:same(current.language.themeIds,baseline.language.themeIds)?original.language.themeIds:[...mergedThemes.values()],toneIds:original.language.toneIds,
    preferredTerms:keep(current.language.preferredTerms,baseline.language.preferredTerms,original.language.preferredTerms),avoidedTerms:keep(current.language.avoidedTerms,baseline.language.avoidedTerms,original.language.avoidedTerms),
    ...(original.language.dialect&&current.language.dialect?{dialect:{...original.language.dialect,...current.language.dialect,packId:keep(current.language.dialect.packId,baseline.language.dialect?.packId||'',original.language.dialect.packId),mode:current.language.dialect.strength===baseline.language.dialect?.strength?original.language.dialect.mode:current.language.dialect.mode}}:{}),
  };
  for(const key of ['registerId','perspective','motif'] as const) if(same(current.language[key],baseline.language[key])) Object.assign(language,{[key]:original.language[key]});
  if(same(current.language.dialect,baseline.language.dialect)) { if(original.language.dialect===undefined) delete language.dialect; else language.dialect=original.language.dialect; }
  return {...original,...current,style,language,narrative:original.narrative,sections:current.sections.map(section=>{
    const prior=original.sections.find(s=>s.id===section.id),projected=baseline.sections.find(s=>s.id===section.id);
    if(!prior||!projected) return section;
    const constraints={...prior.constraints,...section.constraints};
    for(const key of ['rhymeScheme','syllableRange','deliveryId'] as const) if(same(section.constraints[key],projected.constraints[key])) { if(prior.constraints[key]===undefined) delete constraints[key]; else Object.assign(constraints,{[key]:prior.constraints[key]}); }
    const merged={...prior,...section,generationKey:own(state.generationKeys,section.id)||prior.generationKey,role:keep(section.role,projected.role,prior.role),constraints};
    if(same(section.name,projected.name)) {if(prior.name===undefined) delete merged.name; else merged.name=prior.name;}
    return merged;
  })};
}
