import type { BrowserTraceOptions, JavascriptErrorReport } from './api/types.gen';
export type Options = BrowserTraceOptions;
export type Report = JavascriptErrorReport;
export type Bootstrap = { options: Options; tokenUrl: string; reportUrl: string; assetBaseUrl: string };

function read(value: unknown, key: string): unknown {
  try { return value == null ? undefined : (value as Record<string,unknown>)[key]; } catch { return undefined; }
}
function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0,max) : undefined;
}
function position(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : undefined;
}
function isError(value: unknown): value is Error {
  try { return value instanceof Error; } catch { return false; }
}
export function httpUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try { const url=new URL(value,base); return /^https?:$/.test(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export function cleanUrl(value: string, base: string): string {
  try { const url=new URL(value,base); url.search='';url.hash='';url.username='';url.password='';return url.href; } catch { return value.split(/[?#]/)[0]; }
}
export function cleanStack(stack: string): string {
  return stack.replace(/https?:\/\/[^\s)<>"']+/gi, location => {
    const parts=/^(.*?)(:\d+(?::\d+)?)?$/.exec(location)!;
    return cleanUrl(parts[1],parts[1])+(parts[2]??'');
  }).slice(0,8192);
}
export function normalize(event: unknown, pageUrl: string): Report | undefined {
  const eventType=read(event,'type');
  if (eventType!=='error' && eventType!=='unhandledrejection') return undefined;
  const reason=read(event,eventType==='error'?'error':'reason');
  const error=isError(reason) ? reason : undefined;
  const eventMessage=text(read(event,'message'),2048);
  if (eventType==='error' && eventMessage===undefined && !error) return undefined;
  let message=error ? text(read(error,'message'),2048) : undefined;
  if (message===undefined && eventType==='unhandledrejection') {
    message=reason===null ? 'Unhandled rejection (null)' :
      ['string','number','boolean','bigint'].includes(typeof reason) ? String(reason).slice(0,2048) : `Unhandled rejection (${typeof reason})`;
  }
  let pagePath='/';
  try { pagePath=new URL(pageUrl).pathname.slice(0,2048); } catch { /* Browser URL unavailable. */ }
  return { eventType, message:message??eventMessage??'', pagePath,
    errorType:text(read(error,'name'),128), stackTrace:text(read(error,'stack'),8192),
    scriptUrl:httpUrl(text(read(event,'filename'),8192),pageUrl),
    lineNumber:position(read(event,'lineno')),columnNumber:position(read(event,'colno')) };
}
function wildcard(value: string, pattern: string): boolean {
  return new RegExp('^'+pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(value);
}
export function excluded(report: Report, options: Options, allowStackIdentification=false): boolean {
  if (!options.enabled || options.excludedPaths?.some(pattern=>wildcard(report.pagePath,pattern.split(/[?#]/)[0]))) return true;
  if (!report.scriptUrl) return !!options.excludeUnidentifiedScripts && !(allowStackIdentification && report.stackTrace);
  const url=new URL(report.scriptUrl);
  return !!options.excludedScripts?.some(pattern=> {
    if (pattern.startsWith('/')) return wildcard(url.pathname,pattern.split(/[?#]/)[0]);
    try { return wildcard(cleanUrl(url.href,url.href),cleanUrl(pattern,url.href)); } catch { return false; }
  });
}
export function sanitized(report: Report): Report {
  return { ...report,scriptUrl:report.scriptUrl ? cleanUrl(report.scriptUrl,report.scriptUrl).slice(0,2048):undefined,
    stackTrace:report.stackTrace ? cleanStack(report.stackTrace):undefined,
    mappedStackTrace:report.mappedStackTrace ? cleanStack(report.mappedStackTrace):undefined };
}
