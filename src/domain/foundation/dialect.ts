import type { Diagnostic, DialectTransformer, TransformationEdit } from './contracts';
import { isLineProtected, validateDocument } from './editing';

const escape = (text:string) => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Matches original text once. Replacement text is never fed back into another rule. */
export const dialectTransformer: DialectTransformer = {preview(document,pack,options,policy) {
  const diagnostics: Diagnostic[] = [];
  const edits: TransformationEdit[] = [];
  const report=(ruleId:string,message:string,lineIds:readonly string[]=[],severity:Diagnostic['severity']='warning',origin:Diagnostic['origin']='context')=>diagnostics.push({ruleId,message,lineIds,severity,origin});
  const base={expectedRevision:document.revision,pronunciationHints:[],diagnostics};
  try {validateDocument(document);} catch(error) {report('invalid-input',error instanceof Error?error.message:'Invalid lyric document.',[],'error');return {...base,edits};}
  if(!pack || !Array.isArray(pack.rules)) {report('invalid-pack','Dialect rules must be an array.',[],'error');return {...base,edits};}
  if(options.packId!==pack.id) {report('missing-dependency','Dialect pack does not match the selected ID.',[],'error');return {...base,edits};}
  if(!Number.isInteger(options.strength)||options.strength<1||options.strength>5||!['metadata','vocabulary','phonetic'].includes(options.mode)||policy.operation!=='dialect'||!['preserve','replace-explicitly'].includes(policy.authored)) {report('invalid-input','Choose a dialect mode, strength 1–5, and valid replacement policy.',[],'error');return {...base,edits};}
  if(options.mode==='metadata'||options.strength===1) return {...base,edits};
  const ids=new Set<string>();
  for(const rule of pack.rules) {
    if(!rule||typeof rule.id!=='string'||!rule.id.trim()||ids.has(rule.id)||typeof rule.source!=='string'||!rule.source.trim()||typeof rule.replacement!=='string'||!['vocabulary','grammar','phonetic'].includes(rule.kind)||!Number.isInteger(rule.minimumStrength)||rule.minimumStrength<1||rule.minimumStrength>5) {report('invalid-pack','Dialect rules require unique IDs, literal sources, valid kinds and strength limits.',[],'error');return {...base,edits:[]};}
    ids.add(rule.id);
  }
  const rules=pack.rules.filter(rule=>rule.minimumStrength<=options.strength && (options.mode==='phonetic'||rule.kind==='vocabulary')).sort((a,b)=>b.source.length-a.source.length||(a.id<b.id?-1:a.id>b.id?1:0));
  for(const section of document.sections) for(const line of section.lines) {
    const ranges: [number,number][] = [];
    for(const rule of rules) {
      const pattern=new RegExp(`\\b${escape(rule.source)}\\b`,'gi');
      for(const match of line.text.matchAll(pattern)) {
        const start=match.index!,end=start+match[0].length;
        if(ranges.some(([a,b])=>start<b&&end>a)) continue;
        ranges.push([start,end]);
        if(isLineProtected(section,line,policy,false)||line.lockedRanges.some(([a,b])=>start<b&&end>a)) {report('protected','Dialect preview preserves locked or authored text.',[line.id],'info','protected');continue;}
        if(match[0]!==rule.replacement) edits.push({lineId:line.id,range:[start,end],before:match[0],after:rule.replacement,ruleId:rule.id});
      }
    }
  }
  edits.sort((a,b)=>a.lineId<b.lineId?-1:a.lineId>b.lineId?1:a.range[0]-b.range[0]);
  return {...base,edits};
}};
