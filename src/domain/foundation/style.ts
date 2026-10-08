import type { CatalogSnapshot, Diagnostic, ResolvedChoice, ResolvedStyle, Resolution, StyleCompiler, StyleResolver, WeightedRef } from './contracts';

const orderedWeights = (items: readonly WeightedRef[]) => {
  const merged = new Map<string,number>();
  for (const item of items) merged.set(item.id,(merged.get(item.id)||0)+item.weight);
  const sum = [...merged.values()].reduce((a,b)=>a+b,0);
  return [...merged].map(([id,weight])=>({id,weight:weight/sum*100})).sort((a,b)=>b.weight-a.weight || (a.id<b.id?-1:a.id>b.id?1:0));
};
export const styleResolver: StyleResolver = {resolve(intent, catalog: CatalogSnapshot, random): Resolution<ResolvedStyle> {
  const diagnostics: Diagnostic[] = [];
  const report = (ruleId:string,message:string,severity:Diagnostic['severity']='warning') => diagnostics.push({ruleId,message,severity,origin:'context',lineIds:[]});
  if (!Number.isFinite(intent.genres.reduce((sum,x)=>sum+x.weight,0)) || !Number.isFinite(intent.moods.reduce((sum,x)=>sum+x.weight,0)) || !intent.genres.length || [...intent.genres,...intent.moods].some(x=>!Number.isFinite(x.weight)||x.weight<=0) || (intent.bpm!==undefined && (!Number.isFinite(intent.bpm)||intent.bpm<40||intent.bpm>240))) {
    report('style-input','Choose valid positive weights, a genre, and a tempo from 40 to 240 BPM.','error');
    return {status:'invalid-input',diagnostics};
  }
  const choice = (id: string | undefined, category: string): ResolvedChoice | undefined => {
    if (!id) return undefined;
    const entry = catalog.choices.get(id);
    if (entry && entry.category !== category) {report('invalid-choice',`Choice ${id} is not a ${category}.`,'error');return undefined;}
    if (!entry) report('missing-choice',`Missing style choice ${id}.`,'error');
    return entry ? {id:entry.id,label:entry.label} : undefined;
  };
  const genres = orderedWeights(intent.genres).flatMap(item=>{
    const g = catalog.genres.get(item.id);
    if (!g) {report('missing-genre',`Missing genre ${item.id}.`,'error');return [];}
    if (intent.bpm!==undefined && item.weight>=40 && (intent.bpm<g.bpmRange[0]||intent.bpm>g.bpmRange[1])) report('tempo-range',`${intent.bpm} BPM is outside the usual ${g.label} range; this may be intentional.`);
    return [{...item,label:g.label}];
  });
  const moods = orderedWeights(intent.moods).flatMap(item=>{const c=choice(item.id,'mood');return c?[{...c,weight:item.weight}]:[];});
  const traitIds = [...intent.traitIds];
  genres.forEach((genre,i)=>{
    const g = catalog.genres.get(genre.id)!;
    if (i===0 && g.traitIds.length) traitIds.push(g.traitIds[0]);
    if ((i===0||genre.weight>=15) && g.traitIds.length>1) traitIds.push(g.traitIds[1+Math.floor(random.next()*(g.traitIds.length-1))]);
  });
  const traits = [...new Set(traitIds)].flatMap(id=>{
    const t=catalog.traits.get(id);
    if (!t) {report('missing-trait',`Missing trait ${id}.`,'error');return [];}
    return [t];
  });
  const selected = new Set([...traits.map(t=>t.id),...moods.map(m=>m.id)]);
  const checked = new Set<string>();
  for (const id of selected) for (const excluded of catalog.traits.get(id)?.excludes || []) {
    const pair=[id,excluded].sort().join('|');
    if (selected.has(excluded)&&!checked.has(pair)) {checked.add(pair);report('style-conflict',`${catalog.traits.get(id)!.label} and ${catalog.traits.get(excluded)!.label} conflict; use deliberately or separate by section.`);}
  }
  const rhythm = choice(intent.rhythmId,'rhythm');
  const voice = {type:choice(intent.voice.typeId,'voice'),register:choice(intent.voice.registerId,'register'),textures:intent.voice.textureIds.flatMap(id=>{const c=choice(id,'texture');return c?[c]:[];}),deliveries:intent.voice.deliveryIds.flatMap(id=>{const c=choice(id,'delivery');return c?[c]:[];})};
  if (diagnostics.some(d=>d.severity==='error')) return {status:diagnostics.some(d=>d.ruleId==='invalid-choice')?'invalid-input':'missing-dependency',diagnostics};
  return {status:'resolved',value:{genres,moods,traits,...(intent.bpm!==undefined?{bpm:intent.bpm}:{}),...(rhythm?{rhythm}:{}),voice,diagnostics},diagnostics};
}};
const distinct = (values: readonly string[]) => [...new Set(values.filter(Boolean).map(x=>x.toLowerCase()))];
export const styleCompiler: StyleCompiler = {compile(style,format) {
  const names=style.genres.map(g=>g.label.toLowerCase());
  const foundation=names.length>1?`${names[0]} with ${names.slice(1).join(' and ')} influences`:names[0]||'Genre-neutral';
  const sounds=distinct(style.traits.filter(t=>!['production','mix'].includes(t.categoryId)).map(t=>t.label));
  const production=distinct(style.traits.filter(t=>['production','mix'].includes(t.categoryId)).map(t=>t.label)).join(', ');
  const voice=distinct([style.voice.register?.label||'',...style.voice.textures.map(t=>t.label),...style.voice.deliveries.map(t=>t.label),style.voice.type?.label||'']).join(', ');
  const feel=distinct(style.moods.map(m=>m.label)).join(', ')||'balanced';
  const rhythm=[style.bpm===undefined?'':`${style.bpm} BPM`,style.rhythm?.label||''].filter(Boolean).join(', ');
  const vocal=style.voice.type?.id==='voice:instrumental'?'Instrumental; no vocals':`${voice||'expressive'} vocals`;
  if(format==='Compact') return `${foundation[0].toUpperCase()+foundation.slice(1)}. ${feel} mood${rhythm?', '+rhythm:''}. ${sounds.join(', ')}. ${vocal}.${production?' '+production+' production.':''}`;
  const blocks=[`STYLE\n${foundation}.`,`FEEL & RHYTHM\n${feel}. ${rhythm}.`,`VOICE\n${vocal}.`,`ARRANGEMENT\n${sounds.join(', ')}.`,`PRODUCTION\n${production||'Unspecified'}.`];
  if(format==='Annotated') blocks.push(`BLUEPRINT NOTES\nBlend: ${style.genres.map(g=>`${g.label} ${Math.round(g.weight)}%`).join(' / ')}.\n${style.diagnostics.map(d=>d.message).join('\n')||'No style conflicts detected.'}`);
  return blocks.join('\n\n');
}};
