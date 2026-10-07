import type {AppContext} from './app-context';
import {DEFAULT_FAMILY_TIMEZONE,familyLocalDateRangeUtc} from './timezone';

/** Queue timestamps are ISO UTC instants; calendar dates belong to the family. */
export function mealQueueHistoryRange(ctx:AppContext,from:string,to:string){
 const range=familyLocalDateRangeUtc(from,to,String(ctx.member?.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE));
 const iso=(v:string)=>v.replace(' ','T')+'.000Z';
 return {start:iso(range.start),endExclusive:iso(range.endExclusive)};
}
