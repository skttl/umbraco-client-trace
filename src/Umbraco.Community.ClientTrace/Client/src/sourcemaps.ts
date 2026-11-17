import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import type { StackFrame } from 'stacktrace-parser';
import { httpUrl } from './core';
const MAX_BYTES=2*1024*1024;
async function resource(url: string): Promise<string> {
  const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(3000)});
  if (!response.ok || Number(response.headers.get('content-length'))>MAX_BYTES || !response.body) {
    await response.body?.cancel();throw Error('Map unavailable');
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try {
    while (true) {
      const {done,value}=await reader.read();if (done) break;
      size+=value.byteLength;if (size>MAX_BYTES) throw Error('Resource too large');
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
}
export function createMapper() {
  const cache=new Map<string,Promise<TraceMap | undefined>>();
  async function load(scriptUrl: string): Promise<TraceMap | undefined> {
    try {
      const script=await resource(scriptUrl);
      const match=[...script.matchAll(/(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=\s*([^\s*]+)/g)].at(-1);
      if (!match) return undefined;
      const mapUrl=match[1].startsWith('data:') ? scriptUrl : httpUrl(match[1],scriptUrl);
      if (!mapUrl) return undefined;
      let contents: string;
      if (match[1].startsWith('data:')) {
        const inline=/^data:application\/json(?:;charset=[^;,]+)?(;base64)?,(.*)$/.exec(match[1]);
        if (!inline || inline[2].length>MAX_BYTES) return undefined;
        contents=inline[1] ? new TextDecoder().decode(Uint8Array.from(atob(inline[2]),char=>char.charCodeAt(0))) : decodeURIComponent(inline[2]);
      } else contents=await resource(mapUrl);
      const json=JSON.parse(contents);
      if (json.version!==3 || !Array.isArray(json.sources) || !Array.isArray(json.names) || typeof json.mappings!=='string') return undefined;
      delete json.sourcesContent;
      return new TraceMap(json,mapUrl);
    } catch { return undefined; }
  }
  return async (frames: StackFrame[]): Promise<string | undefined> => {
    let changed=false;const output:string[]=[];
    for (const [index,frame] of frames.slice(0,20).entries()) {
      let file=frame.file??'<unknown>',line=frame.lineNumber,column=frame.column,name=frame.methodName;
      const script=frame.file && /^https?:\/\//.test(frame.file) ? httpUrl(frame.file,frame.file) : undefined;
      if (index<5 && script && line && column) {
        if (!cache.has(script)) {
          if (cache.size>=8) cache.delete(cache.keys().next().value!);
          cache.set(script,load(script));
        }
        try {
          const map=await cache.get(script)!;
          if (map) {
            const original=originalPositionFor(map,{line,column:column-1});
            if (original.source && original.line!=null && original.column!=null) {
              file=original.source;line=original.line;column=original.column+1;name=original.name??name;changed=true;
            }
          }
        } catch { /* A malformed frame retains its generated position. */ }
      }
      output.push(`    at ${name??'<unknown>'} (${file}${line ? ':'+line:''}${column ? ':'+column:''})`);
    }
    return changed ? output.join('\n').slice(0,8192) : undefined;
  };
}
