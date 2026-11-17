import { excluded,type Bootstrap,type Report } from './core';
import { listen } from './listeners';
declare const __COLLECTOR_FILE__: string;
const key=Symbol.for('Umbraco.Community.ClientTrace.Frontend');
export function initializeFrontend(target: Window, bootstrap: Bootstrap,
  load=()=>import(/* @vite-ignore */ new URL(__COLLECTOR_FILE__,new URL(bootstrap.assetBaseUrl,target.location.href)).href)) {
  const state=target as unknown as Record<symbol,unknown>;
  if (state[key] || !bootstrap.options.enabled) return;
  let reporter:Promise<(report:Report)=>Promise<void>>|undefined,pending=0;
  state[key]=listen(target,async report=>{
    if (excluded(report,bootstrap.options,true) || pending>=4) return;
    pending++;
    try {
      reporter??=load().then(module=>module.frontendReporter(bootstrap,target.location.href));
      await (await reporter)(report);
    } catch { /* A failed collector download is not retried on this page. */ }
    finally {pending--;}
  });
}
