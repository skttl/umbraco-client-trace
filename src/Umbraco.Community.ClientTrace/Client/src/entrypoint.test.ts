import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
const context=vi.hoisted(()=>({authorized:undefined as ((value:boolean)=>void)|undefined,config:vi.fn(),destroy:vi.fn()}));
vi.mock('@umbraco-cms/backoffice/auth',()=>({UMB_AUTH_CONTEXT:Symbol('auth')}));
vi.mock('@umbraco-cms/backoffice/class-api',()=>({UmbControllerBase:class {
  consumeContext(_token:unknown,callback:(auth:unknown)=>void){callback({isAuthorized:{},getOpenApiConfiguration:context.config});}
  observe(_observable:unknown,callback:(value:boolean)=>void){context.authorized=callback;callback(true);}
  destroy(){context.destroy();}
}}));
import { onInit,onUnload } from './entrypoint';
import { initializeFrontend } from './frontend-init';
const options={enabled:true,useSourceMaps:false,excludedPaths:[],excludedScripts:[],excludeUnidentifiedScripts:false};
const fire=(message='failed')=>window.dispatchEvent(Object.assign(new Event('error'),{message,filename:'https://example.test/app.js',lineno:1,colno:2}));
beforeEach(()=>{
  vi.stubGlobal('window',Object.assign(new EventTarget(),{location:{href:'https://example.test/sub/umbraco/first'}}));
  context.config.mockReturnValue({base:'https://example.test/sub',credentials:'include',token:async()=> 'minimum17'});
});
afterEach(()=>{onUnload({} as never,{} as never);vi.unstubAllGlobals();});
describe('Umbraco17 backoffice entrypoint',()=>{
  it('uses minimum-version auth configuration, generated bearer operations, current SPA paths and one listener lifecycle',async()=>{
    const fetch=vi.fn(async(request:Request)=>request.method==='GET'?Response.json(options):new Response(null,{status:204}));vi.stubGlobal('fetch',fetch);
    onInit({} as never,{} as never);onInit({} as never,{} as never);
    await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());await new Promise(resolve=>setTimeout(resolve,0));
    window.location.href='https://example.test/sub/umbraco/next?private=1';fire();
    await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
    const configuration=fetch.mock.calls[0][0],report=fetch.mock.calls[1][0];
    expect(configuration.url).toBe('https://example.test/sub/umbraco/management/api/v1/client-trace/configuration');
    expect(configuration.credentials).toBe('include');expect(configuration.headers.get('Authorization')).toBe('Bearer minimum17');
    expect(report.headers.get('Authorization')).toBe('Bearer minimum17');expect(await report.json()).toMatchObject({pagePath:'/sub/umbraco/next'});
    context.authorized!(false);expect(configuration.signal.aborted).toBe(true);expect(report.signal.aborted).toBe(true);fire('logged out');await new Promise(resolve=>setTimeout(resolve,0));expect(fetch).toHaveBeenCalledTimes(2);
    context.authorized!(true);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(3));await new Promise(resolve=>setTimeout(resolve,0));
    onUnload({} as never,{} as never);fire('unloaded');expect(context.destroy).toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each(['logout','unload'])('drops an event awaiting lazy mapping after %s',async action=>{
    let release!:(value:Response)=>void;
    const resource=new Promise<Response>(resolve=>{release=resolve;});
    const script=`https://example.test/pending-${action}.js`;
    const fetch=vi.fn(async(request:Request|string)=>typeof request==='string' ? request===script ? resource : Response.json({version:3,sources:['original.ts'],names:[],mappings:'AAAA'}) : request.method==='GET' ? Response.json({...options,useSourceMaps:true}) : new Response(null,{status:204}));vi.stubGlobal('fetch',fetch);
    onInit({} as never,{} as never);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());await new Promise(resolve=>setTimeout(resolve,0));
    const reason=new Error('old lifecycle');reason.stack=`Error: old lifecycle\n    at run (${script}:1:1)`;
    window.dispatchEvent(Object.assign(new Event('error'),{message:'old lifecycle',filename:script,lineno:1,colno:1,error:reason}));
    await vi.waitFor(()=>expect(fetch.mock.calls.some(([request])=>request===script)).toBe(true));
    if(action==='logout')context.authorized!(false);else onUnload({} as never,{} as never);
    release(new Response('//# sourceMappingURL=pending.map'));
    await vi.waitFor(()=>expect(fetch.mock.calls.some(([request])=>typeof request==='string' && request.endsWith('pending.map'))).toBe(true));
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(fetch.mock.calls.filter(([request])=>request instanceof Request && request.method==='POST')).toHaveLength(0);
  });
  it('never sends an old pending event with a new login token',async()=>{
    let release!:(value:Response)=>void;const resource=new Promise<Response>(resolve=>{release=resolve;});
    const script='https://example.test/pending-relogin.js';
    const fetch=vi.fn(async(request:Request|string)=>typeof request==='string' ? request===script ? resource : Response.json({version:3,sources:['original.ts'],names:[],mappings:'AAAA'}) : request.method==='GET' ? Response.json({...options,useSourceMaps:true}) : new Response(null,{status:204}));vi.stubGlobal('fetch',fetch);
    onInit({} as never,{} as never);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());await new Promise(resolve=>setTimeout(resolve,0));
    const reason=new Error('old lifecycle');reason.stack=`Error: old lifecycle\n    at run (${script}:1:1)`;
    window.dispatchEvent(Object.assign(new Event('error'),{message:'old lifecycle',filename:script,lineno:1,colno:1,error:reason}));
    await vi.waitFor(()=>expect(fetch.mock.calls.some(([request])=>request===script)).toBe(true));
    context.authorized!(false);
    context.config.mockReturnValue({base:'https://example.test/sub',credentials:'include',token:async()=> 'new-login'});context.authorized!(true);
    await vi.waitFor(()=>expect(fetch.mock.calls.filter(([request])=>request instanceof Request && request.method==='GET')).toHaveLength(2));await new Promise(resolve=>setTimeout(resolve,0));
    fire('new lifecycle');
    await vi.waitFor(()=>expect(fetch.mock.calls.filter(([request])=>request instanceof Request && request.method==='POST')).toHaveLength(1));
    release(new Response('//# sourceMappingURL=relogin.map'));
    await vi.waitFor(()=>expect(fetch.mock.calls.some(([request])=>typeof request==='string' && request.endsWith('relogin.map'))).toBe(true));await new Promise(resolve=>setTimeout(resolve,0));
    const posts=fetch.mock.calls.map(([request])=>request).filter(request=>request instanceof Request && request.method==='POST') as Request[];
    expect(posts).toHaveLength(1);expect(posts[0].headers.get('Authorization')).toBe('Bearer new-login');
    expect(await posts[0].json()).toMatchObject({message:'new lifecycle'});
  });
  it('leaves frontend independent when backoffice is disabled and contains configuration failure',async()=>{
    const fetch=vi.fn(async()=>Response.json({...options,enabled:false}));vi.stubGlobal('fetch',fetch);
    const report=vi.fn(async()=>{});const load=vi.fn(async()=>({frontendReporter:()=>report}));
    initializeFrontend(window,{options,tokenUrl:'/token',reportUrl:'/reports',assetBaseUrl:'/App_Plugins/ClientTrace/'},load);
    onInit({} as never,{} as never);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());await new Promise(resolve=>setTimeout(resolve,0));fire();
    await vi.waitFor(()=>expect(report).toHaveBeenCalledOnce());expect(fetch).toHaveBeenCalledOnce();
    fetch.mockRejectedValue(Error('offline'));context.authorized!(true);await new Promise(resolve=>setTimeout(resolve,0));expect(fetch).toHaveBeenCalledTimes(2);
  });
});
