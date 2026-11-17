import { normalize,type Report } from './core';
export function listen(target: Window, handler:(report:Report)=>unknown): ()=>void {
  const capture=(event:Event)=>{
    try {
      const report=normalize(event,target.location.href);
      if (report) Promise.resolve(handler(report)).catch(()=>{});
    } catch { /* Hostile values and collector failures cannot escape the listener. */ }
  };
  target.addEventListener('error',capture);
  target.addEventListener('unhandledrejection',capture);
  return ()=>{target.removeEventListener('error',capture);target.removeEventListener('unhandledrejection',capture);};
}
