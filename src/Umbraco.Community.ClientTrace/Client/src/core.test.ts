import { describe, it, expect } from 'vitest';
import { normalize, excluded, cleanUrl, cleanStack, type Report } from './core';
import { createReporter } from './collector';
const options = { enabled:true, useSourceMaps:true, excludedPaths:[], excludedScripts:[], excludeUnidentifiedScripts:false };
const base = 'https://example.test/current?private=1';
const error = (values:object = {}) => ({ type:'error', message:'failed', filename:'https://cdn.test/app.js?v=123#x', lineno:2, colno:3, error:new TypeError('failed'), ...values });
describe('normalization and exclusions', () => {
  it('keeps raw locations internally and strips query/hash from URL and stack reports', () => {
    const result = normalize(error(),base)!;
    expect(result.scriptUrl).toBe('https://cdn.test/app.js?v=123#x');
    expect(result.pagePath).toBe('/current');
    expect(result.errorType).toBe('TypeError');
    expect(result.lineNumber).toBe(2);
    expect(cleanUrl(result.scriptUrl!,base)).toBe('https://cdn.test/app.js');
    expect(cleanStack('at run (https://cdn.test/app.js?v=123#x:2:3)')).toBe('at run (https://cdn.test/app.js:2:3)');
  });
  it.each([
    {name:'query parentheses',raw:'at run (https://example.test/app.js?filter=(status)&private=VALUE:10:20)',expected:'at run (https://example.test/app.js:10:20)'},
    {name:'hash parentheses',raw:'run@https://example.test/app.js#filter=(status)&private=VALUE:10:20',expected:'run@https://example.test/app.js:10:20'},
    {name:'path and query parentheses',raw:'at run (https://example.test/app(v2).js?filter=(status)&private=VALUE#other=(VALUE):10:20)',expected:'at run (https://example.test/app(v2).js:10:20)'},
    {name:'userinfo and query',raw:'at run (https://user:VALUE@example.test/app.js?filter=(status)&private=VALUE:10:20)',expected:'at run (https://example.test/app.js:10:20)'},
  ])('cleans complete stack URL boundaries for $name without losing coordinates',({raw,expected})=>{
    expect(cleanStack(raw)).toBe(expected);
  });
  it('cleans parenthesized query and fragment tails in actual normalized outgoing reports',async()=>{
    const script='https://example.test/app.js?filter=(status)&private=VALUE#other=(VALUE)';
    const reason=new Error('failed');reason.stack=`Error: failed\n    at run (${script}:10:20)`;
    const normalized=normalize(error({filename:script,error:reason}),base)!;
    let sent:Report|undefined;
    await createReporter({...options,useSourceMaps:false},async report=>{sent=report;},base)(normalized);
    expect(sent?.scriptUrl).toBe('https://example.test/app.js');
    expect(sent?.stackTrace).toBe('Error: failed\n    at run (https://example.test/app.js:10:20)');
    expect(JSON.stringify(sent)).not.toContain('VALUE');
  });
  it.each(['text',42,true,undefined,null,3n,Symbol('reason')])('describes primitive rejection %s without arbitrary serialization', reason => {
    const result = normalize({type:'unhandledrejection',reason},base)!;
    expect(result.eventType).toBe('unhandledrejection');
    expect(typeof result.message).toBe('string');
    expect(result.scriptUrl).toBeUndefined();
  });
  it('does not invoke getters, coercion or serialization on cyclic and hostile objects', () => {
    const hostile = Object.create(null); hostile.self=hostile;
    Object.defineProperty(hostile,'message',{get(){throw new Error('getter');}});
    hostile.toString=()=>{throw new Error('coercion');};
    expect(normalize({type:'unhandledrejection',reason:hostile},base)?.message).toBe('Unhandled rejection (object)');
    expect(normalize({type:'unhandledrejection',reason:new Proxy({}, {get(){throw Error('proxy');},getPrototypeOf(){throw Error('proxy');}})},base)?.message).toBe('Unhandled rejection (object)');
  });
  it('handles absent stacks, unavailable browser data, resource events and invalid positions', () => {
    expect(normalize({type:'error'},base)).toBeUndefined();
    const result=normalize(error({error:undefined,filename:'',lineno:0,colno:-1}),base)!;
    expect(result.message).toBe('failed'); expect(result.stackTrace).toBeUndefined();
    expect(result.lineNumber).toBeUndefined(); expect(result.columnNumber).toBeUndefined();
  });
  it('bounds messages and stacks without exposing arbitrary object fields', () => {
    const e=new Error('x'.repeat(4000));e.stack='s'.repeat(10000);
    const result=normalize({type:'unhandledrejection',reason:e},base)!;
    expect(result.message.length).toBe(2048);expect(result.stackTrace?.length).toBe(8192);
  });
  it('uses exact matches and only star wildcard, with case sensitive paths and normalized origins', () => {
    const report=normalize(error(),base)!;
    expect(excluded(report,{...options,excludedScripts:['/app.js']})).toBe(true);
    expect(excluded(report,{...options,excludedScripts:['HTTPS://CDN.TEST/app.js?v=other']})).toBe(true);
    expect(excluded(report,{...options,excludedScripts:['https://other.test/*']})).toBe(false);
    expect(excluded(report,{...options,excludedScripts:['/app.*']})).toBe(true);
    expect(excluded(report,{...options,excludedScripts:['/App.js']})).toBe(false);
    expect(excluded(report,{...options,excludedScripts:['/app']})).toBe(false);
    expect(excluded(report,{...options,excludedScripts:['/app.?s']})).toBe(false);
  });
  it('uses the current SPA path and independent options, preserving unidentified reports by default', () => {
    const report=normalize({type:'unhandledrejection',reason:'text'},'https://example.test/umbraco/new?private=1#x')!;
    expect(excluded(report,options)).toBe(false);
    expect(excluded(report,{...options,excludeUnidentifiedScripts:true})).toBe(true);
    expect(excluded(report,{...options,excludedPaths:['/umbraco/*']})).toBe(true);
    expect(excluded(report,{...options,enabled:false})).toBe(true);
    expect(excluded(report,options)).toBe(false);
  });
});
