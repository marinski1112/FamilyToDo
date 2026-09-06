import type { AppContext } from './app-context';
import { json } from './response';
import { taskEdit as canonicalTaskEdit } from './task-edit-page';
import { validateTaskEditRequestHierarchy } from './task-edit-hierarchy-guard';

export async function taskEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{
  const hierarchy=await validateTaskEditRequestHierarchy(request,ctx,id);
  if(!hierarchy.ok)return json({ok:false,error:hierarchy.message,code:'BAD_REQUEST'},hierarchy.status);
  return canonicalTaskEdit(request,ctx,id);
}

export { itemEdit } from './item-edit-page';
export { today, tomorrow } from './daily-task-page';
export { taskEvents } from './task-events-page';
export { taskView } from './task-view-page';
