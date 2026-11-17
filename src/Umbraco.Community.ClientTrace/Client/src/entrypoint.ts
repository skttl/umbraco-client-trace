import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbEntryPointOnInit,UmbEntryPointOnUnload } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { client } from './api/client.gen';
import { getClientTraceConfiguration,postClientTraceReport } from './api/sdk.gen';
import { createReporter } from './collector';
import { listen } from './listeners';
const key=Symbol.for('Umbraco.Community.ClientTrace.Backoffice');
const state=()=>window as unknown as Record<symbol,ClientTraceController | undefined>;
class ClientTraceController extends UmbControllerBase {
  #stop:(()=>void)|undefined;
  #generation=0;
  #lifecycle=new AbortController();
  constructor(host:UmbControllerHost) {
    super(host);
    this.consumeContext(UMB_AUTH_CONTEXT,context=>{
      this.observe(context?.isAuthorized,authorized=>{
        const generation=++this.#generation;this.#lifecycle.abort();this.#stop?.();this.#stop=undefined;
        const lifecycle=this.#lifecycle=new AbortController();
        if (!authorized || !context) return;
        const config=context.getOpenApiConfiguration();
        client.setConfig({baseUrl:config.base,credentials:config.credentials,auth:config.token});
        void getClientTraceConfiguration({signal:AbortSignal.any([lifecycle.signal,AbortSignal.timeout(3000)])}).then(({data})=>{
          if (generation!==this.#generation || !data?.enabled) return;
          const report=createReporter(data,async body=>{
            if (generation!==this.#generation) return;
            await postClientTraceReport({body,signal:AbortSignal.any([lifecycle.signal,AbortSignal.timeout(3000)])});
          },window.location.href);
          this.#stop=listen(window,report);
        }).catch(()=>{});
      },'clientTraceAuthorization');
    });
  }
  override destroy() {
    ++this.#generation;this.#lifecycle.abort();this.#stop?.();
    if (state()[key]===this) delete state()[key];
    super.destroy();
  }
}
export const onInit:UmbEntryPointOnInit=host=>{state()[key]??=new ClientTraceController(host);};
export const onUnload:UmbEntryPointOnUnload=()=>state()[key]?.destroy();
