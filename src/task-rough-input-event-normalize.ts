const DATE_ONLY_EVENT_LINE=/^(?:\d{4}[\/.\-])?\d{1,2}[\/.\-]\d{1,2}$|^\d{1,2}\s*月\s*\d{1,2}\s*日$/u;
const EVENT_METADATA_LINE=/^(?:説明|メモ|備考|note|url|リンク|数量|個数|カテゴリー|カテゴリ|期限|締切)\s*[:：]/iu;
const URL_ONLY_LINE=/^https?:\/\/\S+$/iu;

function isEventTitleLine(value:string):boolean{
  const line=value.trim();
  return Boolean(line)&&!DATE_ONLY_EVENT_LINE.test(line)&&!EVENT_METADATA_LINE.test(line)&&!URL_ONLY_LINE.test(line);
}

/**
 * EVENT-only semantic normalization shared by every HTTP caller of the rough-input API.
 * A date-only line is metadata for the immediately following title line; ordinary
 * adjacent title lines stay separate records. Blank lines intentionally break the pair.
 */
export function normalizeEventDateTitleText(value:unknown):string{
  const original=String(value??'');
  const lines=original.replace(/\r\n?/g,'\n').split('\n');
  const out:string[]=[];
  let changed=false;
  for(let index=0;index<lines.length;index++){
    const current=lines[index].trim();
    const next=index+1<lines.length?lines[index+1].trim():'';
    if(current&&DATE_ONLY_EVENT_LINE.test(current)&&isEventTitleLine(next)){
      out.push(next,`期限: ${current}`);
      index++;
      changed=true;
      continue;
    }
    out.push(lines[index]);
  }
  return changed?out.join('\n'):original;
}

export function normalizeEventRoughInputBody(value:unknown):unknown{
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const body=value as Record<string,unknown>;
  if(String(body.primaryType||'')!=='event'||!Array.isArray(body.fields))return value;
  let changed=false;
  const fields=body.fields.map(field=>{
    if(!field||typeof field!=='object'||Array.isArray(field))return field;
    const row=field as Record<string,unknown>;
    if(String(row.destination||'')!=='event'||typeof row.text!=='string')return field;
    const text=normalizeEventDateTitleText(row.text);
    if(text===row.text)return field;
    changed=true;
    return {...row,text};
  });
  return changed?{...body,fields}:value;
}

export async function normalizeEventRoughInputRequest(request:Request):Promise<Request>{
  if(request.method!=='POST')return request;
  if(!String(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return request;
  let parsed:unknown;
  try{parsed=JSON.parse(await request.clone().text());}catch{return request;}
  const normalized=normalizeEventRoughInputBody(parsed);
  if(normalized===parsed)return request;
  return new Request(request,{body:JSON.stringify(normalized)});
}
