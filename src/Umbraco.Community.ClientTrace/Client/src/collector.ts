import type { StackFrame } from 'stacktrace-parser';
import { excluded, httpUrl, sanitized, type Options, type Report } from './core';
import { createFrontendSender } from './transport';
import type { Bootstrap } from './core';
let parser: Promise<typeof import('stacktrace-parser')> | undefined;
let mapper: Promise<ReturnType<typeof import('./sourcemaps')['createMapper']>> | undefined;
export function createReporter(options: Options, send: (report: Report)=>Promise<unknown>, baseUrl: string) {
  let pending=0,count=0,windowStart=Date.now();const seen=new Map<string,number>();
  return async (raw: Report): Promise<void> => {
    try {
      if (excluded(raw,options,true) || pending>=4) return;
      const now=Date.now();if (now-windowStart>=60000) {count=0;seen.clear();windowStart=now;}
      const key=JSON.stringify([raw.eventType,raw.message,raw.pagePath,raw.scriptUrl,raw.lineNumber,raw.columnNumber,raw.stackTrace]);
      if (seen.has(key) || count>=30) return;
      seen.set(key,now);count++;pending++;
      try {
        let frames:StackFrame[]=[];
        if (raw.stackTrace) {
          try { parser??=import('stacktrace-parser');frames=(await parser).parse(raw.stackTrace).slice(0,20); } catch { /* Raw report still works. */ }
        }
        let report={...raw};
        if (!report.scriptUrl) {
          const frame=frames.find(item=>item.file && /^(https?:\/\/|\/)/.test(item.file) && httpUrl(item.file,baseUrl));
          if (frame) report={...report,scriptUrl:httpUrl(frame.file??undefined,baseUrl),lineNumber:frame.lineNumber??undefined,columnNumber:frame.column??undefined};
        }
        if (excluded(report,options)) return;
        if (options.useSourceMaps && frames.length) {
          try { mapper??=import('./sourcemaps').then(module=>module.createMapper());report.mappedStackTrace=await (await mapper)(frames); } catch { /* Import or mapping failures preserve raw data. */ }
        }
        const body=sanitized(report);
        if (new TextEncoder().encode(JSON.stringify(body)).byteLength<=32768) await send(body);
      } finally {pending--;}
    } catch { /* Collector-owned failures must never become browser errors. */ }
  };
}
export function frontendReporter(bootstrap: Bootstrap, pageUrl: string) {
  return createReporter(bootstrap.options,createFrontendSender(bootstrap),pageUrl);
}
