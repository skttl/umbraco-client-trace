import { build } from 'vite';
const result=await build();
const collector=result.output.find(chunk=>chunk.type==='chunk' && chunk.facadeModuleId?.replaceAll('\\','/').endsWith('/src/collector.ts'));
if (!collector) throw Error('Collector asset missing');
await build({configFile:false,publicDir:false,define:{__COLLECTOR_FILE__:JSON.stringify(collector.fileName)},
  build:{outDir:'../wwwroot',emptyOutDir:false,sourcemap:true,target:'es2022',
    lib:{entry:'src/frontend.ts',name:'ClientTraceFrontend',formats:['iife'],fileName:()=> 'frontend.js'}}});
