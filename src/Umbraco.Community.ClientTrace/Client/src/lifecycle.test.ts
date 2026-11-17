import { afterEach,describe,it,expect,vi } from 'vitest';
import { initializeFrontend } from './frontend-init';
import { listen } from './listeners';
import type { Bootstrap,Report } from './core';
const config:Bootstrap={options:{enabled:true,useSourceMaps:false,excludedPaths:[],excludedScripts:[],excludeUnidentifiedScripts:false},tokenUrl:'/sub/client-trace/token',reportUrl:'/sub/client-trace/reports',assetBaseUrl:'/sub/App_Plugins/ClientTrace/'};
const target=()=>Object.assign(new EventTarget(),{location:{href:'https://example.test/start'}}) as unknown as Window;
const event=(message='failed')=>Object.assign(new Event('error',{cancelable:true}),{message,filename:'https://example.test/app.js',lineno:1,colno:2});
afterEach(()=>vi.unstubAllGlobals());
describe('surface lifecycle',()=>{
  it('registers frontend listeners synchronously once and shares one lazy collector across early errors',async()=>{
    const win=target(),report=vi.fn(async(_report:Report)=>{}),factory=vi.fn(()=>report),load=vi.fn(async()=>({frontendReporter:factory}));
    initializeFrontend(win,config,load);initializeFrontend(win,config,load);
    const first=event();win.dispatchEvent(first);win.location.href='https://example.test/next?private=1';win.dispatchEvent(event('next'));
    await vi.waitFor(()=>expect(report).toHaveBeenCalledTimes(2));expect(load).toHaveBeenCalledOnce();expect(factory).toHaveBeenCalledOnce();
    expect(report.mock.calls[0][0].pagePath).toBe('/start');expect(report.mock.calls[1][0].pagePath).toBe('/next');expect(first.defaultPrevented).toBe(false);
  });
  it('loads nothing for disabled/excluded scripts/pages and bounds early errors before module download completes',async()=>{
    const load=vi.fn(async()=>{throw Error('network');});const win=target();
    initializeFrontend(win,{...config,options:{...config.options,excludedScripts:['/app.js']}},load);win.dispatchEvent(event());expect(load).not.toHaveBeenCalled();
    const disabled=target();initializeFrontend(disabled,{...config,options:{...config.options,enabled:false}},load);disabled.dispatchEvent(event());expect(load).not.toHaveBeenCalled();
    const bad=target();initializeFrontend(bad,config,load);for(let i=0;i<10;i++)bad.dispatchEvent(event(String(i)));
    await new Promise(resolve=>setTimeout(resolve,0));bad.dispatchEvent(event('again'));await new Promise(resolve=>setTimeout(resolve,0));expect(load).toHaveBeenCalledOnce();
  });
  it('leaves browser default handling intact, ignores resources and removes listeners on cleanup',async()=>{
    const win=target(),handler=vi.fn(async()=>{throw Error('collector');}),stop=listen(win,handler);
    win.dispatchEvent(new Event('error'));expect(handler).not.toHaveBeenCalled();
    const failure=event();win.dispatchEvent(failure);await new Promise(resolve=>setTimeout(resolve,0));expect(failure.defaultPrevented).toBe(false);
    stop();win.dispatchEvent(event());expect(handler).toHaveBeenCalledOnce();
  });
});
