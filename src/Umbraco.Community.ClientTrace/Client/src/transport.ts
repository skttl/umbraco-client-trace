import type { Bootstrap,Report } from './core';
export function createFrontendSender(bootstrap: Bootstrap) {
  let token: Promise<{requestToken:string;headerName:string}> | undefined;
  return async (report: Report): Promise<void> => {
    try {
      token??=fetch(bootstrap.tokenUrl,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(3000)})
        .then(async response=> {
          if (!response.ok) throw Error('Token unavailable');
          const result=await response.json();
          if (typeof result.requestToken!=='string' || typeof result.headerName!=='string') throw Error('Invalid token response');
          return result;
        });
      const {requestToken,headerName}=await token;
      await fetch(bootstrap.reportUrl,{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(3000),
        headers:{'Content-Type':'application/json',[headerName]:requestToken},body:JSON.stringify(report)});
    } catch { /* No retries, persistence, console logging or rejected promises. */ }
  };
}
