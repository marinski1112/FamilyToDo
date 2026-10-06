import {addCalendarDays,isIsoCalendarDate} from './timezone';

/** Calendar days, not elapsed hours: yesterday remains a correction day. */
export function isDailySummaryDate(date:string,today:string):boolean{
  return isIsoCalendarDate(date)&&isIsoCalendarDate(today)&&date<=addCalendarDays(today,-2);
}
export function dailySummaryRedirect(request:Request,date:string,today:string,authenticated:boolean):string|null{
  const url=new URL(request.url);
  if(!authenticated||request.method!=='GET'||url.searchParams.has('overdue')||!isDailySummaryDate(date,today))return null;
  return `/app/family_journal.php?month=${date.slice(0,7)}&date=${date}&view=day`;
}
