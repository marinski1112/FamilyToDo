export type LineOfficialAccountInfo = {
  basic_id:string;
  display_name:string;
  add_friend_url:string;
  recommend_url:string;
};

/** Fetch non-secret public metadata for the configured LINE official account. */
export async function lineOfficialAccountInfo(env: Env): Promise<LineOfficialAccountInfo | null> {
  const token=String(env.LINE_ACCESS_TOKEN||'').trim();
  if(!token) return null;
  try{
    const r=await fetch('https://api.line.me/v2/bot/info',{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok) return null;
    const d=await r.json() as {basicId?:string;premiumId?:string;displayName?:string};
    const lineId=String(d.premiumId||d.basicId||'').trim();
    if(!lineId) return null;
    const encoded=encodeURIComponent(lineId);
    return {
      basic_id:lineId,
      display_name:String(d.displayName||'Family TODO LINE'),
      add_friend_url:`https://line.me/R/ti/p/${encoded}`,
      recommend_url:`https://line.me/R/nv/recommendOA/${encoded}`,
    };
  }catch{return null;}
}
