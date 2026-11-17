import { describe, it, expect } from 'vitest';
import { normalize, excluded, cleanUrl, cleanStack } from './core';
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
