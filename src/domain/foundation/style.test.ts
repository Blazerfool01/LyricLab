import { describe,it,expect } from 'vitest';
import { catalog } from './catalogs';
import { namedRandom } from './randomness';
import { styleResolver,styleCompiler } from './style';
import type { StyleIntent } from './contracts';
const intent: StyleIntent = {
  genres:[{id:'indie-folk',weight:70},{id:'dream-pop',weight:30}],
  moods:[{id:'mood:reflective',weight:60},{id:'mood:hopeful',weight:40}],
  bpm:92,rhythmId:'rhythm:steady',
  voice:{typeId:'voice:lead',registerId:'register:mid',textureIds:['texture:airy'],deliveryIds:['delivery:melodic']},
  traitIds:['instrument:acoustic-guitar','production:organic','mix:vocal-forward'],
};
const resolve=(input=intent)=>styleResolver.resolve(input,catalog,namedRandom(2408,['style']));
describe('independent style resolution and rendering',()=>{
  it('resolves the same complete descriptions without mutating intent',()=>{
    const before=structuredClone(intent);
    expect(resolve()).toEqual(resolve());
    expect(intent).toEqual(before);
    const result=resolve();expect(result.status).toBe('resolved');
    if(result.status!=='resolved') throw new Error('Resolution failed');
    expect(result.value.genres.map(g=>[g.label,g.weight])).toEqual([['Indie folk',70],['Dream pop',30]]);
    expect(result.value.moods.map(m=>m.label)).toEqual(['Reflective','Hopeful']);
    expect(result.value.rhythm?.label).toBe('Steady 4/4');
    expect(result.value.voice.type?.label).toBe('Lead');
    for(const format of ['Compact','Detailed','Annotated'] as const) {
      const output=styleCompiler.compile(result.value,format);
      expect(output).toContain('92 BPM');expect(output).toContain('organic');
      expect(output.toLowerCase()).toContain('reflective');
      expect(output.toLowerCase()).toContain('steady 4/4');
    }
  });
  it('compiler depends solely on descriptions already resolved',()=>{
    const result=resolve();if(result.status!=='resolved') throw new Error('Resolution failed');
    const renamed={...result.value,genres:[{id:'uninstalled',label:'Local invented genre',weight:100}]};
    expect(styleCompiler.compile(renamed,'Compact')).toContain('Local invented genre');
  });
  it('aggregates repeated genre weights and deduplicates stable trait IDs',()=>{
    const result=resolve({...intent,genres:[{id:'indie-folk',weight:20},{id:'indie-folk',weight:50},{id:'dream-pop',weight:30}],traitIds:['production:organic','production:organic']});
    expect(result.status).toBe('resolved');if(result.status!=='resolved')return;
    expect(result.value.genres.map(g=>g.weight)).toEqual([70,30]);
    expect(result.value.traits.filter(t=>t.id==='production:organic')).toHaveLength(1);
  });
  it('surfaces conflicts once and preserves intentional creative choices',()=>{
    const result=resolve({...intent,moods:[{id:'mood:hopeful',weight:50},{id:'mood:dark',weight:50}],traitIds:['production:raw','production:polished']});
    expect(result.status).toBe('resolved');
    expect(result.diagnostics.filter(d=>d.ruleId==='style-conflict')).toHaveLength(2);
  });
  it('surfaces missing references instead of substituting labels',()=>{
    const result=resolve({...intent,genres:[{id:'unknown-genre',weight:100}],rhythmId:'unknown-rhythm'});
    expect(result.status).toBe('missing-dependency');
    expect(result.diagnostics.map(d=>d.ruleId)).toContain('missing-genre');
  });
  it.each([NaN,0,-1,Infinity])('rejects invalid selection weight %s',weight=>{
    expect(resolve({...intent,genres:[{id:'indie-folk',weight}]}).status).toBe('invalid-input');
  });
  it('rejects overflow in aggregated finite weights',()=>{
    expect(resolve({...intent,genres:[{id:'indie-folk',weight:Number.MAX_VALUE},{id:'dream-pop',weight:Number.MAX_VALUE}]}).status).toBe('invalid-input');
  });
  it('rejects choices from the wrong domain category',()=>{
    expect(resolve({...intent,moods:[{id:'voice:lead',weight:100}]}).status).toBe('invalid-input');
  });
  it('compiles instrumental voice intent clearly',()=>{
    const result=resolve({...intent,voice:{...intent.voice,typeId:'voice:instrumental'}});
    if(result.status!=='resolved')throw new Error('Resolution failed');
    expect(styleCompiler.compile(result.value,'Compact')).toContain('Instrumental; no vocals');
  });
});
