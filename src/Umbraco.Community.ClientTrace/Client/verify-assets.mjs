import assert from 'node:assert/strict';
import { readFile,readdir,stat } from 'node:fs/promises';
import { resolve,dirname,sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
const root=resolve('../wwwroot');
const frontend=await readFile(resolve(root,'frontend.js'),'utf8');
assert(!frontend.includes('@umbraco-cms/'),'Frontend must not load backoffice modules');
assert(!frontend.includes('import.meta'),'Frontend must be a classic script');
const entrypoint=await readFile(resolve(root,'entrypoint.js'),'utf8');
assert(/export\{[^}]*\bonInit\b/.test(entrypoint) && /export\{[^}]*\bonUnload\b/.test(entrypoint),'Backoffice lifecycle exports must survive production tree shaking');
const manifest=JSON.parse(await readFile(resolve(root,'umbraco-package.json'),'utf8'));
assert.equal(manifest.extensions[0].js,'/App_Plugins/ClientTrace/entrypoint.js');
async function verify(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const file=resolve(directory,entry.name);
    if (entry.isDirectory()) await verify(file);
    else if (file.endsWith('.js')) {
      const contents=await readFile(file,'utf8');
      for (const match of contents.matchAll(/(?:from\s*|import\(\s*)["'](\.[^"']+)["']/g)) {
        const imported=resolve(dirname(file),match[1]);assert(imported.startsWith(root+sep));await stat(imported);
      }
    }
  }
}
await verify(root);
const bootstrap={options:{enabled:true,useSourceMaps:false,excludedScripts:[],excludedPaths:[],excludeUnidentifiedScripts:false},tokenUrl:'/sub/client-trace/token',reportUrl:'/sub/client-trace/reports',assetBaseUrl:'/sub/App_Plugins/ClientTrace/'};
const win=Object.assign(new EventTarget(),{location:{href:'https://example.test/sub/page?private=1'}});
const globals={window:win,document:{currentScript:{dataset:{clientTrace:JSON.stringify(bootstrap)}}},URL,Symbol,Promise,Error};
const imports=[],requests=[];const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
  requests.push({url,init});
  return url===bootstrap.tokenUrl ? Response.json({requestToken:'test-request',headerName:'X-CSRF'}) : new Response(null,{status:204});
};
try {
  const options={importModuleDynamically:async specifier=>{
    const url=new URL(specifier);assert(url.pathname.startsWith('/sub/App_Plugins/ClientTrace/assets/'));
    imports.push(url.href);
    return import(pathToFileURL(resolve(root,url.pathname.slice('/sub/App_Plugins/ClientTrace/'.length))).href);
  }};
  runInNewContext(frontend,globals,options);runInNewContext(frontend,globals,options);
  assert.equal(requests.length,0);assert.equal(imports.length,0);
  const failure=Object.assign(new Event('error',{cancelable:true}),{message:'production asset smoke',filename:'https://example.test/app.js?v=one#private',lineno:2,colno:3});
  win.dispatchEvent(failure);
  const deadline=Date.now()+2000;
  while (requests.length<2 && Date.now()<deadline) await new Promise(done=>setTimeout(done,10));
  assert.equal(imports.length,1,'Exactly one lazy hashed collector loads after the early event');
  assert.equal(requests.length,2,'One token and one report are sent through the actual production collector');
  assert.equal(requests[1].url,bootstrap.reportUrl);
  assert.equal(requests[1].init.credentials,'same-origin');assert.equal(requests[1].init.headers['X-CSRF'],'test-request');
  assert.deepEqual(JSON.parse(requests[1].init.body),{eventType:'error',message:'production asset smoke',pagePath:'/sub/page',scriptUrl:'https://example.test/app.js',lineNumber:2,columnNumber:3});
  assert.equal(failure.defaultPrevented,false);
  console.log('Production asset assertions passed: classic synchronous bootstrap, duplicate init, early error, actual hashed collector, PathBase, lazy token/report, sanitized payload, entry exports and chunk URLs.');
} finally {globalThis.fetch=originalFetch;}
