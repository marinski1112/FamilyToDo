export const DEFAULT_CALENDAR_COLOR='#7c3aed';

export const CALENDAR_COLOR_OPTIONS=[
  {value:'#7c3aed',label:'紫'},
  {value:'#2563eb',label:'青'},
  {value:'#16a34a',label:'緑'},
  {value:'#ea580c',label:'橙'},
  {value:'#dc2626',label:'赤'},
  {value:'#db2777',label:'ピンク'},
  {value:'#0891b2',label:'水色'},
  {value:'#64748b',label:'灰'},
] as const;

const CALENDAR_COLOR_PATTERN=/^#[0-9a-f]{6}$/i;

export function isAllowedCalendarColor(value:unknown):boolean{
  return CALENDAR_COLOR_PATTERN.test(String(value||'').trim());
}

export function normalizeCalendarColor(value:unknown,fallback=DEFAULT_CALENDAR_COLOR):string{
  const candidate=String(value||'').trim();
  if(isAllowedCalendarColor(candidate))return candidate.toLowerCase();
  const safeFallback=String(fallback||'').trim();
  return isAllowedCalendarColor(safeFallback)?safeFallback.toLowerCase():DEFAULT_CALENDAR_COLOR;
}
