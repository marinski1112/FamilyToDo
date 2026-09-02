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

const CALENDAR_COLOR_VALUES=new Set<string>(CALENDAR_COLOR_OPTIONS.map(option=>option.value));

export function isAllowedCalendarColor(value:unknown):boolean{
  return CALENDAR_COLOR_VALUES.has(String(value||''));
}

export function normalizeCalendarColor(value:unknown,fallback=DEFAULT_CALENDAR_COLOR):string{
  const candidate=String(value||'');
  return isAllowedCalendarColor(candidate)?candidate:fallback;
}

export function calendarColorOptionsHtml():string{
  return CALENDAR_COLOR_OPTIONS.map(option=>`<option value="${option.value}">${option.label}</option>`).join('');
}
