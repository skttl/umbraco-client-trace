import { afterEach,describe,it,expect,vi } from 'vitest';
import { createReporter } from './collector';
import { createFrontendSender } from './transport';
import { createMapper } from './sourcemaps';
import type { Report,Options } from './core';
const options:Options={enabled:true,useSourceMaps:true,excludedPaths:[],excludedScripts:[],excludeUnidentifiedScripts:false};
const raw=(message='broken'):Report=>({eventType:'error',message,pagePath:'/page',scriptUrl:'https://example.test/app.js?v=one',lineNumber:1,columnNumber:1,stackTrace:'Error: broken\n    at run (https://example.test/app.js?v=one:1:1)\n    at missing (https://example.test/missing.js:3:4)'});
const map=JSON.stringify({version:3,names:['original'],sources:['src/original.ts'],sourcesContent:['DO NOT REPORT SOURCE'],mappings:'AASEA'});
const frames=[{file:'https://example.test/app.js?v=one',methodName:'run',arguments:[],lineNumber:1,column:1}];
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('reporter',()=>{
  it('identifies the first usable raw stack frame before exclusions without fetching maps or tokens',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const send=vi.fn();
    const report={...raw(),scriptUrl:undefined};
    await createReporter({...options,excludedScripts:['/app.js']},send,'https://example.test/')(report);
    expect(send).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it('sends sanitized raw data with source maps disabled and does not fetch resources',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const send=vi.fn();
    await createReporter({...options,useSourceMaps:false},send,'https://example.test/')(raw());
    expect(fetch).not.toHaveBeenCalled();expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({scriptUrl:'https://example.test/app.js',stackTrace:expect.stringContaining('https://example.test/app.js:1:1)')});
    expect(send.mock.calls[0][0].mappedStackTrace).toBeUndefined();
  });
  it('drops disabled sections and excluded SPA paths before any network work',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const send=vi.fn();
    await createReporter({...options,enabled:false},send,'https://example.test/')(raw());
    await createReporter({...options,excludedPaths:['/page']},send,'https://example.test/')(raw());
    expect(send).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it('reports mapped and raw traces together, and keeps ordinary reporting when maps fail',async()=>{
    const fetch=vi.fn(async(url:string)=>url.includes('unavailable')?new Response('',{status:404}):url.endsWith('.map')?new Response(map):new Response('//# sourceMappingURL=app.js.map'));vi.stubGlobal('fetch',fetch);
    const send=vi.fn(async(_report:Report)=>{}),report=createReporter(options,send,'https://example.test/');
    await report(raw('mapped'));
    expect(send.mock.calls[0][0].mappedStackTrace).toContain('original.ts:10:3');
    expect(send.mock.calls[0][0].mappedStackTrace).toContain('missing.js:3:4');
    expect(send.mock.calls[0][0].stackTrace).toContain('app.js:1:1');
    expect(JSON.stringify(send.mock.calls[0][0])).not.toContain('DO NOT REPORT SOURCE');
    await report({...raw('unavailable'),scriptUrl:'https://example.test/unavailable.js',stackTrace:'Error: failed\n    at run (https://example.test/unavailable.js:1:1)'});
    expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[1][0].mappedStackTrace).toBeUndefined();
    expect(send.mock.calls[1][0].stackTrace).toContain('unavailable.js:1:1');
  });
  it('keeps unidentified reports, skips unusable frames and enforces a finite per-minute event budget',async()=>{
    const send=vi.fn(async(_report:Report)=>{}),report=createReporter({...options,useSourceMaps:false},send,'https://example.test/');
    await report({...raw('unidentified'),scriptUrl:undefined,stackTrace:'Error: failed\n    at run (native:1:1)'});
    expect(send.mock.calls[0][0].scriptUrl).toBeUndefined();
    for(let i=1;i<32;i++)await report({...raw(String(i)),stackTrace:undefined});
    expect(send).toHaveBeenCalledTimes(30);
  });
  it('deduplicates repeats, bounds simultaneous work, and contains transport failures',async()=>{
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const send=vi.fn(async()=>{await gate;throw Error('offline');});
    const report=createReporter({...options,useSourceMaps:false},send,'https://example.test/');
    const jobs=Array.from({length:10},(_,i)=>report(raw(String(i))));
    await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(4));release();
    await expect(Promise.all(jobs)).resolves.toBeDefined();
    await report(raw('0'));expect(send).toHaveBeenCalledTimes(4);
  });
});
describe('frontend antiforgery',()=>{
  const config={options,tokenUrl:'/sub/client-trace/token',reportUrl:'/sub/client-trace/reports',assetBaseUrl:'/sub/App_Plugins/ClientTrace/'};
  it('shares the first in-flight token and reuses it with same-origin cookie/header',async()=>{
    let resolve!:(response:Response)=>void;const token=new Promise<Response>(done=>{resolve=done;});
    const fetch=vi.fn((url:string,_init?:RequestInit)=>url===config.tokenUrl?token:Promise.resolve(new Response(null,{status:204})));vi.stubGlobal('fetch',fetch);
    const send=createFrontendSender(config);const jobs=[send(raw('one')),send(raw('two'))];
    expect(fetch).toHaveBeenCalledTimes(1);resolve(Response.json({requestToken:'visitor',headerName:'X-CSRF'}));await Promise.all(jobs);
    await send(raw('three'));expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[1][1]).toMatchObject({credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF':'visitor'}});
  });
  it('contains failed token and report requests without retries or unhandled rejections',async()=>{
    const fetch=vi.fn().mockRejectedValue(Error('offline'));vi.stubGlobal('fetch',fetch);
    const send=createFrontendSender(config);await send(raw());await send(raw('next'));expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockReset().mockResolvedValueOnce(Response.json({requestToken:'x',headerName:'X-CSRF'})).mockRejectedValue(Error('failed post'));
    const another=createFrontendSender(config);await another(raw());expect(fetch).toHaveBeenCalledTimes(2);
  });
});
describe('source maps',()=>{
  it('shares concurrent fetches, retains version queries, maps known positions and sends no credentials/source',async()=>{
    const fetch=vi.fn(async(url:string,_init?:RequestInit)=>url.endsWith('.map?map=2')?new Response(map):new Response('throw Error();\n//# sourceMappingURL=app.js.map?map=2'));vi.stubGlobal('fetch',fetch);
    const mapper=createMapper();const [first,second]=await Promise.all([mapper(frames),mapper(frames)]);
    expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls[0][0]).toBe('https://example.test/app.js?v=one');
    expect(fetch.mock.calls[1][0]).toBe('https://example.test/app.js.map?map=2');
    expect(first).toContain('https://example.test/src/original.ts:10:3');expect(second).toBe(first);
    expect(first).not.toContain('DO NOT REPORT SOURCE');expect(fetch.mock.calls[0][1]).toMatchObject({credentials:'omit'});
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('headers');
  });
  it('preserves unmapped frames in partially mapped traces and retains raw reports after unavailable maps',async()=>{
    const fetch=vi.fn(async(url:string,_init?:RequestInit)=>url.includes('missing')?new Response('',{status:404}):url.endsWith('.map')?new Response(map):new Response('//# sourceMappingURL=app.js.map'));vi.stubGlobal('fetch',fetch);
    const mapped=await createMapper()([...frames,{...frames[0],file:'https://example.test/missing.js',lineNumber:3,column:4}]);
    expect(mapped).toContain('original.ts:10:3');expect(mapped).toContain('missing.js:3:4');
    fetch.mockImplementation(async()=>new Response('invalid map'));
    expect(await createMapper()(frames)).toBeUndefined();
  });
  it('supports inline base64 maps using the native decoder',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('//# sourceMappingURL=data:application/json;base64,'+btoa(map))));
    expect(await createMapper()(frames)).toContain('original.ts:10:3');
  });
  it('bounds large responses even without content length and falls back on timeout',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('x'.repeat(2097153))));
    expect(await createMapper()(frames)).toBeUndefined();
    const fetch=vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>init.signal!.addEventListener('abort',()=>reject(init.signal!.reason),{once:true})));vi.stubGlobal('fetch',fetch);
    const started=Date.now();expect(await createMapper()(frames)).toBeUndefined();expect(Date.now()-started).toBeLessThan(4000);
  });
});
