import { defineConfig } from '@hey-api/openapi-ts';
export default defineConfig({
  input: process.env.CLIENT_TRACE_OPENAPI_URL ?? 'http://localhost:5271/umbraco/swagger/management/swagger.json',
  parser: { filters: { operations: { include: [
    'GET /umbraco/management/api/v1/client-trace/configuration',
    'POST /umbraco/management/api/v1/client-trace/reports',
  ] }, orphans: false } },
  output: 'src/api',
  plugins: ['@hey-api/typescript', '@hey-api/client-fetch', '@hey-api/sdk'],
});
