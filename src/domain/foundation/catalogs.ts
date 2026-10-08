import { genres, palette, cadenceRanges, traitConflicts } from '../data';
import { exceptions, dialectMaps } from '../legacy-pack';
import type { CatalogSnapshot, CatalogView, DialectPack, GenreDefinition, PronunciationEntry, TemplateDefinition, TraitDefinition, VocabularyEntry } from './contracts';
import { fingerprint } from './randomness';

export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function immutableView<T extends { readonly id: string }>(entries: readonly T[]): CatalogView<T> {
  const copied = structuredClone(entries) as T[];
  const index = new Map<string, T>();
  for (const entry of copied) {
    if (!entry.id?.trim() || index.has(entry.id)) throw new Error(`Invalid or duplicate catalogue ID: ${entry.id}`);
    index.set(entry.id, freeze(entry));
  }
  const ordered = Object.freeze([...index.values()].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return Object.freeze({ get: (id: string) => index.get(id), all: () => ordered });
}
export interface Choice { readonly id: string; readonly label: string; readonly category: string; readonly range?: readonly [number, number] }
/** Explicit stable identities; labels can change without changing these IDs. */
const choiceGroups: Record<string, readonly (readonly [string,string])[]> = {
  mood: [['reflective','Reflective'],['hopeful','Hopeful'],['melancholic','Melancholic'],['warm','Warm'],['dreamy','Dreamy'],['energetic','Energetic'],['dark','Dark'],['intimate','Intimate'],['defiant','Defiant'],['nostalgic','Nostalgic']],
  instrument: [['acoustic-guitar','Acoustic guitar'],['ambient-pads','Ambient pads'],['piano','Piano'],['electric-guitar','Electric guitar'],['strings','Strings'],['analog-synth','Analog synth'],['pedal-steel','Pedal steel'],['electric-piano','Electric piano']],
  production: [['organic','Organic'],['warm-analog','Warm analog'],['spacious','Spacious'],['lo-fi','Lo-fi'],['polished','Polished'],['raw','Raw'],['minimal','Minimal'],['layered','Layered']],
  texture: [['airy','Airy'],['warm','Warm'],['breathy','Breathy'],['raspy','Raspy'],['clear','Clear'],['soft','Soft'],['rich','Rich'],['gravelly','Gravelly']],
  delivery: [['melodic','Melodic'],['conversational','Conversational'],['clipped','Short / clipped'],['dense','Dense rhythmic'],['triplet','Triplet'],['double-time','Double-time'],['spacious','Dragged / spacious'],['syncopated','Syncopated'],['spoken','Spoken']],
  rhythm: [['steady','Steady 4/4'],['swing','Swing 4/4'],['waltz','Waltz 3/4'],['half-time','Half-time groove'],['syncopated','Syncopated groove'],['free','Free rhythm']],
  voice: [['lead','Lead'],['duet','Duet'],['group','Group'],['instrumental','Instrumental']],
  register: [['low','Low'],['mid','Mid-range'],['high','High'],['wide','Wide range']],
  language: [['plain','Plain'],['poetic','Poetic'],['conversational','Conversational'],['aggressive','Aggressive'],['abstract','Abstract']],
  drums: [['soft-live','Soft live drums'],['brushed','Brushed drums'],['sample','Sample-driven drums'],['electronic','Tight electronic drums'],['heavy-live','Heavy live drums']],
  bass: [['warm','Warm bass'],['sub','Rounded sub-bass'],['upright','Acoustic upright bass'],['distorted','Distorted bass'],['synth','Synth bass']],
  mix: [['vocal-forward','Vocal-forward'],['balanced','Balanced mix'],['wide','Wide stereo'],['dry','Dry and intimate'],['deep','Deep reverberant mix']],
  theme: [['finding','Finding your way'],['love','Love & connection'],['letting-go','Letting go'],['ambition','Ambition & identity'],['home','Home & belonging']],
  dialect: [['standard','Standard'],['british','British English'],['american','American English']],
};
export interface FoundationCatalog extends CatalogSnapshot { readonly choices: CatalogView<Choice> }
export function createCatalog(): FoundationCatalog {
  const choices: Choice[] = Object.entries(choiceGroups).flatMap(([category, entries]) => entries.map(([id,label]) => ({id: `${category}:${id}`, label, category, ...(cadenceRanges[label] ? {range: cadenceRanges[label]} : {})})));
  const choiceFor = (label: string, category: string) => choices.find(x => x.category === category && x.label === label)!;
  const traits: TraitDefinition[] = choices.filter(c => ['mood','instrument','production','texture','delivery','drums','bass','mix'].includes(c.category)).map(c => ({id:c.id,label:c.label,categoryId:c.category,excludes:traitConflicts.flatMap(rule => rule.domain === (c.category === 'mood' ? 'moods' : c.category) && rule.pair.includes(c.label) ? rule.pair.filter(x=>x!==c.label).map(x=>choiceFor(x,c.category).id) : [])}));
  const genreEntries: GenreDefinition[] = genres.map(g => {
    const ids = ['foundation','accompaniment','detail'].map(key => `genre:${g.id}:${key}`);
    g.descriptors.forEach((label,i) => traits.push({id:ids[i],label,categoryId:'genre-descriptor',excludes:[]}));
    return {id:g.id,label:g.name,familyId:({Folk:'family:folk',Pop:'family:pop','R&B':'family:rnb','Hip-hop':'family:hip-hop',Rock:'family:rock',Electronic:'family:electronic',Soul:'family:soul',Country:'family:country'} as Record<string,string>)[g.family],traitIds:ids,bpmRange:g.bpm as [number,number]};
  });
  const vocabulary: VocabularyEntry[] = [];
  const templates: TemplateDefinition[] = [];
  for (const [id,label] of choiceGroups.theme) {
    const bank = palette[label];
    const themeId = `theme:${id}`;
    for (const [key,kind] of [['objects','object'],['places','location'],['states','state']] as const) bank[key].forEach((text,i) => vocabulary.push({id:`${themeId}:${kind}:${i+1}`,text,kind,themeIds:[themeId],toneIds:[],grammar:{}}));
    bank.lines.forEach((pattern,i)=>templates.push({id:`${themeId}:verse:${i+1}`,roles:['establish','develop','challenge','resolve'],archetypes:[],pattern,slots:{},effects:[]}));
  }
  const patterns = {
    'title-drop':['{title}, I follow where you go','A little {motif}, a little room to grow','I do not need the answer just to know','{title}, I am learning to move slow'],
    refrain:['I follow the {motif}, soft and slow','The {object} holds a place for what I find','I follow the {motif} where I go','And carry what I choose to leave behind'],
    statement:['{claim}','The {object} reminds me what I know','{title}, I leave some room to grow','{claim}'],
    bridge:['I see the {motif} in a different way','What seemed so far is closer than before','I leave a space for what I cannot say','And find a reason to try once more'],
  } as const;
  for (const [family, lines] of Object.entries(patterns)) lines.forEach((pattern,i) => templates.push({id:`legacy:${family}:${i+1}`,roles:family==='bridge'?['reveal']:['resolve'],archetypes:family==='bridge'?[]:[family as 'title-drop'|'refrain'|'statement'],pattern,slots:pattern.includes('{object}')?{object:'object'}:{},effects:[]}));
  const pronunciations: PronunciationEntry[] = Object.entries(exceptions).map(([token,syllables])=>({id:`pronunciation:${token}`,token,locale:'en',syllables,phonemes:[]}));
  const dialects: DialectPack[] = choiceGroups.dialect.map(([id,label])=>({id:`dialect:${id}`,styleTags:label==='Standard'?[]:[label],rules:[...Object.entries(dialectMaps[label] || {}).map(([source,replacement])=>({id:`${id}:${source}`,kind:'vocabulary' as const,source,replacement,minimumStrength:2 as const})),...(id==='standard'?[]:[{id:`${id}:going-to`,kind:'grammar' as const,source:'going to',replacement:'gonna',minimumStrength:4 as const}])]}));
  const content = {genres:genreEntries,traits,vocabulary,templates,pronunciations,dialects,choices};
  const snapshot: FoundationCatalog = {
    packs:[{id:'legacy-v0.1',version:'1.0.0',contentHash:fingerprint(content)}],
    genres:immutableView(genreEntries),traits:immutableView(traits),vocabulary:immutableView(vocabulary),templates:immutableView(templates),pronunciations:immutableView(pronunciations),dialects:immutableView(dialects),choices:immutableView(choices),
  };
  for (const genre of snapshot.genres.all()) if (genre.traitIds.some(id=>!snapshot.traits.get(id))) throw new Error('Missing genre trait');
  for (const trait of snapshot.traits.all()) if (trait.excludes.some(id=>!snapshot.traits.get(id))) throw new Error('Missing conflict reference');
  return freeze(snapshot);
}
/** Legacy facades retain the original object shape and descriptor ordering. */
export const legacyGenreView = immutableView(genres);
export const catalog = createCatalog();
export function choiceId(category: string, label: string): string {
  return catalog.choices.all().find(c=>c.category===category && c.label===label)?.id || `unavailable:${category}:${label}`;
}
