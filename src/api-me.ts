import type { AppContext } from './app-context';
import { json } from './response';

type Row = Record<string, unknown>;

/** Canonical /api/me handler independent from the legacy app.ts monolith. */
export async function apiMe(ctx:AppContext):Promise<Response>{
  if(!ctx.member) return json({ok:true,authenticated:false});
  const family=await ctx.env.DB.prepare('SELECT id,name,family_code FROM families WHERE id=?').bind(ctx.member.family_id).first<Row>();
  return json({ok:true,authenticated:true,member:ctx.member,family});
}
