import { defineConfig } from 'vite';
export default defineConfig({
  base:'./',
  build:{outDir:'../wwwroot',emptyOutDir:true,sourcemap:true,
    rollupOptions:{preserveEntrySignatures:'strict',input:{entrypoint:'src/entrypoint.ts',collector:'src/collector.ts'},
      external:id=>id.startsWith('@umbraco-cms/'),
      output:{entryFileNames:chunk=>chunk.name==='entrypoint'?'entrypoint.js':'assets/[name]-[hash].js',chunkFileNames:'assets/[name]-[hash].js'}}}
});
