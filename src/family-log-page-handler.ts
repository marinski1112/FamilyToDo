import type { AppContext } from './app-context';
import { familyLogMutationBoundary } from './family-log-mutation-boundary';
import { familyLogPage } from './family-log-page';

export async function familyLog(request:Request,ctx:AppContext):Promise<Response>{
  if(request.method==='POST')return familyLogMutationBoundary(request,ctx);
  return familyLogPage(request,ctx);
}
