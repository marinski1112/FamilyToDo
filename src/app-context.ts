import { getSessionCookie, openSession } from './session';
import { DEFAULT_FAMILY_TIMEZONE } from './timezone';
import type { CurrentMember, SessionData } from './types';

export interface AppContext {
  request: Request;
  env: Env;
  session: SessionData;
  member: CurrentMember | null;
  executionContext?: ExecutionContext;
}

export async function memberById(env: Env, id: number): Promise<CurrentMember | null> {
  return (await env.DB.prepare('SELECT m.*,COALESCE(f.timezone,?) family_timezone FROM members m JOIN families f ON f.id=m.family_id WHERE m.id=? AND m.active=1 LIMIT 1')
    .bind(env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE,id)
    .first<CurrentMember>()) ?? null;
}

export async function makeContext(request: Request, env: Env, executionContext?: ExecutionContext): Promise<AppContext> {
  const session = await openSession(getSessionCookie(request), env.APP_SECRET);
  const member = session.memberId ? await memberById(env, session.memberId) : null;
  return { request, env, session, member, executionContext };
}
