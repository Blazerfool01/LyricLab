import {describe,it,expect} from 'vitest';
import {catalog} from './catalogs';
import {dialectTransformer} from './dialect';
import {makeTestContext} from './test-context';
import {withRevision,documentApplicator} from './editing';
import type {DialectOptions,DialectPack} from './contracts';
const policy={operation:'dialect' as const,authored:'preserve' as const};
const pack=catalog.dialects.get('dialect:british')!;
const options:DialectOptions={packId:pack.id,strength:4,mode:'phonetic'};
const makeDoc=(texts:readonly string[])=>withRevision(makeTestContext(texts).request.document.sections);
describe('controlled dialect preview',()=>{
  it('previews whole words and phrases without changing the document',()=>{
    const doc=makeDoc(['My apartment elevator is going to the sidewalk','apartmental elevators']);
    const before=structuredClone(doc);
    const preview=dialectTransformer.preview(doc,pack,options,policy);
    expect(preview.edits.map(e=>[e.before,e.after])).toEqual([['apartment','flat'],['elevator','lift'],['going to','gonna'],['sidewalk','pavement']]);
    expect(doc).toEqual(before);
    const result=documentApplicator.apply(doc,{kind:'transformation',preview,replacementPolicy:policy});
    expect(result.status).toBe('applied');
    if(result.status==='applied') expect(result.document.sections[0].lines.map(l=>l.text)).toEqual(['My flat lift is gonna the pavement','apartmental elevators']);
  });
  it('distinguishes metadata, vocabulary-only, and grammar/phonetic modes',()=>{
    const doc=makeDoc(['I am going to my apartment']);
    expect(dialectTransformer.preview(doc,pack,{...options,mode:'metadata'},policy).edits).toEqual([]);
    expect(dialectTransformer.preview(doc,pack,{...options,strength:1},policy).edits).toEqual([]);
    expect(dialectTransformer.preview(doc,pack,{...options,mode:'vocabulary'},policy).edits.map(e=>e.before)).toEqual(['apartment']);
    expect(dialectTransformer.preview(doc,pack,{...options,strength:3},policy).edits.map(e=>e.before)).toEqual(['apartment']);
    expect(dialectTransformer.preview(doc,pack,options,policy).edits).toHaveLength(2);
  });
  it('never transforms section locks, line locks, authored/unknown text, or locked words',()=>{
    const base=makeDoc(['apartment','apartment','apartment','apartment elevator']);
    const section=base.sections[0];
    const lines=section.lines.map((line,i)=>({...line,...(i===0?{locked:true}:i===1?{origin:'authored' as const}:i===2?{origin:'unknown' as const}:{lockedRanges:[[0,9] as const]})}));
    const doc=withRevision([{...section,lines}]);
    const preview=dialectTransformer.preview(doc,pack,options,policy);
    expect(preview.edits.map(e=>e.before)).toEqual(['elevator']);
    const unlockedPolicy={...policy,authored:'replace-explicitly' as const};
    expect(dialectTransformer.preview(doc,pack,options,unlockedPolicy).edits).toHaveLength(3);
    expect(dialectTransformer.preview(withRevision([{...section,locked:true}]),pack,options,unlockedPolicy).edits).toEqual([]);
  });
  it('does not cascade replacements and chooses longest overlapping source once',()=>{
    const testPack:DialectPack={id:'test',styleTags:[],rules:[{id:'a',kind:'vocabulary',source:'town centre',replacement:'downtown',minimumStrength:2},{id:'b',kind:'vocabulary',source:'town',replacement:'city',minimumStrength:2},{id:'c',kind:'vocabulary',source:'downtown',replacement:'village',minimumStrength:2}]};
    const preview=dialectTransformer.preview(makeDoc(['town centre']),testPack,{...options,packId:'test'},policy);
    expect(preview.edits.map(e=>[e.before,e.after])).toEqual([['town centre','downtown']]);
  });
  it('rejects stale document content rather than previewing against it',()=>{
    const doc=makeDoc(['apartment']);
    const preview=dialectTransformer.preview({...doc,revision:'outdated'},pack,options,policy);
    expect(preview.edits).toEqual([]);
    expect(preview.diagnostics[0].ruleId).toBe('invalid-input');
  });
  it('reports malformed rules and mismatched pack references',()=>{
    const doc=makeDoc(['apartment']);
    expect(dialectTransformer.preview(doc,pack,{...options,packId:'missing'},policy).diagnostics[0].ruleId).toBe('missing-dependency');
    const invalid={...pack,rules:[...pack.rules,pack.rules[0]]};
    expect(dialectTransformer.preview(doc,invalid,options,policy).diagnostics[0].ruleId).toBe('invalid-pack');
    expect(dialectTransformer.preview(doc,pack,{...options,strength:6 as 5},policy).diagnostics[0].ruleId).toBe('invalid-input');
  });
});
