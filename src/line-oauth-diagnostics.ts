export type LineTokenExchangeCategory='success'|'invalid_request'|'invalid_grant'|'invalid_client'|'unsupported_grant_type'|'unknown'|'never';
let last:LineTokenExchangeCategory='never';
export const lineTokenExchangeDiagnostic=()=>last;
export const recordLineTokenExchange=(value:LineTokenExchangeCategory)=>{last=value;};
export const safeLineTokenErrorCategory=(value:unknown):LineTokenExchangeCategory=>{const category=String(value||'');return ['invalid_request','invalid_grant','invalid_client','unsupported_grant_type'].includes(category)?category as LineTokenExchangeCategory:'unknown';};
