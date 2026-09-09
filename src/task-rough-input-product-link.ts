export type ProductLinkPreview={url:string;title:string};
export type ProductLinkPreviewBlock={
  originalText:string;
  titleSeed:string;
  lines:string[];
  productLinkPreview?:ProductLinkPreview|null;
};
export type ProductLinkPreviewField={destination:string;blocks:ProductLinkPreviewBlock[]};

const MAX_PRODUCT_LINK_PREVIEWS=4;
const MAX_REDIRECTS=3;
const MAX_HTML_BYTES=256*1024;
const FETCH_TIMEOUT_MS=4_000;
const MAX_METADATA_TITLE_LENGTH=400;
const TRAILING_URL_PUNCTUATION=/[),.;。、「」』】]+$/u;
const URL_TOKEN=/https?:\/\/[^\s<>"']+/giu;
const BLOCKED_HOST_SUFFIXES=['.localhost','.local','.internal','.home','.lan','.test','.invalid','.example','.arpa'];

function ipv4Parts(hostname:string):number[]|null{
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname))return null;
  const parts=hostname.split('.').map(Number);
  return parts.length===4&&parts.every(part=>Number.isInteger(part)&&part>=0&&part<=255)?parts:null;
}

function publicIpv4(parts:number[]):boolean{
  const [a,b,c]=parts;
  if(a===0||a===10||a===127||a>=224)return false;
  if(a===100&&b>=64&&b<=127)return false;
  if(a===169&&b===254)return false;
  if(a===172&&b>=16&&b<=31)return false;
  if(a===192&&b===168)return false;
  if(a===192&&b===0&&c===0)return false;
  if(a===192&&b===0&&c===2)return false;
  if(a===198&&(b===18||b===19))return false;
  if(a===198&&b===51&&c===100)return false;
  if(a===203&&b===0&&c===113)return false;
  return true;
}

export function parsePublicProductUrl(raw:string):URL|null{
  let url:URL;
  try{url=new URL(String(raw||'').trim());}catch{return null;}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
  if(url.port&&url.port!==(url.protocol==='https:'?'443':'80'))return null;
  const hostname=url.hostname.replace(/\.$/,'').toLowerCase();
  if(!hostname||hostname.includes(':')||!hostname.includes('.'))return null;
  if(hostname==='localhost'||BLOCKED_HOST_SUFFIXES.some(suffix=>hostname.endsWith(suffix)))return null;
  const ipv4=ipv4Parts(hostname);if(ipv4&&!publicIpv4(ipv4))return null;
  url.hash='';
  return url;
}

export function firstPublicProductUrl(text:string):URL|null{
  const source=String(text||'');
  for(const match of source.matchAll(URL_TOKEN)){
    const candidate=String(match[0]||'').replace(TRAILING_URL_PUNCTUATION,'');
    const url=parsePublicProductUrl(candidate);if(url)return url;
  }
  return null;
}

function decodeHtmlEntities(value:string):string{
  const named:Record<string,string>={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/giu,(_all,entity:string)=>{
    const key=String(entity).toLowerCase();
    if(key.startsWith('#x')){const code=Number.parseInt(key.slice(2),16);return Number.isFinite(code)?String.fromCodePoint(Math.min(code,0x10ffff)):_all;}
    if(key.startsWith('#')){const code=Number.parseInt(key.slice(1),10);return Number.isFinite(code)?String.fromCodePoint(Math.min(code,0x10ffff)):_all;}
    return named[key]??_all;
  });
}

function cleanMetadataTitle(value:unknown):string|null{
  const title=decodeHtmlEntities(String(value??'').replace(/<[^>]*>/g,' ')).replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
  return title?title.slice(0,MAX_METADATA_TITLE_LENGTH):null;
}

function jsonLdProductName(value:unknown,state={seen:0}):string|null{
  if(state.seen++>200||value===null||value===undefined)return null;
  if(Array.isArray(value)){for(const item of value){const name=jsonLdProductName(item,state);if(name)return name;}return null;}
  if(typeof value!=='object')return null;
  const record=value as Record<string,unknown>,rawType=record['@type'],types=Array.isArray(rawType)?rawType:[rawType];
  if(types.some(type=>String(type||'').toLowerCase()==='product')){
    const name=cleanMetadataTitle(record.name);if(name)return name;
  }
  for(const child of Object.values(record)){const name=jsonLdProductName(child,state);if(name)return name;}
  return null;
}

function attributeValue(tag:string,name:string):string|null{
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i'));
  return match?(match[1]??match[2]??match[3]??null):null;
}

export function extractProductTitleFromHtml(html:string):string|null{
  const source=String(html||'').slice(0,MAX_HTML_BYTES);
  const scriptPattern=/<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/giu;
  for(const match of source.matchAll(scriptPattern)){
    try{const name=jsonLdProductName(JSON.parse(match[1]));if(name)return name;}catch{/* Malformed page metadata falls through to Open Graph/title. */}
  }
  for(const meta of source.matchAll(/<meta\b[^>]*>/giu)){
    const tag=meta[0],property=String(attributeValue(tag,'property')||attributeValue(tag,'name')||'').toLowerCase();
    if(property!=='og:title'&&property!=='twitter:title')continue;
    const title=cleanMetadataTitle(attributeValue(tag,'content'));if(title)return title;
  }
  const titleMatch=source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu);
  return titleMatch?cleanMetadataTitle(titleMatch[1]):null;
}

function decoderFor(contentType:string):TextDecoder{
  const charset=contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/iu)?.[1]?.trim();
  if(charset){try{return new TextDecoder(charset);}catch{/* Unsupported labels fall back to UTF-8. */}}
  return new TextDecoder('utf-8');
}

async function boundedResponseText(response:Response):Promise<string|null>{
  if(!response.body)return '';
  const reader=response.body.getReader(),chunks:Uint8Array[]=[],decoder=decoderFor(response.headers.get('content-type')||'');
  let total=0;
  try{
    while(total<MAX_HTML_BYTES){
      const {done,value}=await reader.read();if(done)break;
      if(!value)continue;
      const remaining=MAX_HTML_BYTES-total;
      if(value.byteLength<=remaining){chunks.push(value);total+=value.byteLength;continue;}
      chunks.push(value.slice(0,remaining));total+=remaining;break;
    }
    if(total>=MAX_HTML_BYTES)await reader.cancel().catch(()=>undefined);
  }catch{return null;}
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return decoder.decode(bytes);}catch{return new TextDecoder('utf-8').decode(bytes);}
}

async function fetchHtml(url:URL,fetchImpl:typeof fetch):Promise<string|null>{
  const deadline=Date.now()+FETCH_TIMEOUT_MS;
  let current=new URL(url.href);
  for(let redirects=0;redirects<=MAX_REDIRECTS;redirects++){
    const remaining=deadline-Date.now();if(remaining<=0)return null;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),remaining);
    let response:Response;
    try{
      response=await fetchImpl(current.href,{method:'GET',redirect:'manual',signal:controller.signal,headers:{accept:'text/html,application/xhtml+xml;q=0.9'}});
    }catch{clearTimeout(timer);return null;}
    clearTimeout(timer);
    if(response.status>=300&&response.status<400){
      if(redirects===MAX_REDIRECTS)return null;
      const location=response.headers.get('location');if(!location)return null;
      let next:URL;try{next=new URL(location,current);}catch{return null;}
      const safe=parsePublicProductUrl(next.href);if(!safe)return null;
      current=safe;continue;
    }
    if(!response.ok)return null;
    const contentType=String(response.headers.get('content-type')||'').toLowerCase();
    if(!contentType||(!contentType.startsWith('text/html')&&!contentType.startsWith('application/xhtml+xml')))return null;
    return boundedResponseText(response);
  }
  return null;
}

export async function fetchProductLinkPreview(rawUrl:string,fetchImpl:typeof fetch=fetch):Promise<ProductLinkPreview|null>{
  const url=parsePublicProductUrl(rawUrl);if(!url)return null;
  const html=await fetchHtml(url,fetchImpl);if(!html)return null;
  const title=extractProductTitleFromHtml(html);if(!title)return null;
  return {url:url.href,title};
}

function urlOnlyTitleSeed(block:ProductLinkPreviewBlock):URL|null{
  const seed=String(block.titleSeed||'').trim(),direct=parsePublicProductUrl(seed);
  if(direct)return direct;
  const prefixed=seed.match(/^(?:url|リンク)\s*[:：]\s*(https?:\/\/\S+)$/iu);
  return prefixed?.[1]?parsePublicProductUrl(prefixed[1].replace(TRAILING_URL_PUNCTUATION,'')):null;
}

export async function enrichShoppingProductLinkPreviews(fields:ProductLinkPreviewField[],fetchImpl:typeof fetch=fetch):Promise<number>{
  const candidates:Array<{block:ProductLinkPreviewBlock;url:URL}>=[],seen=new Set<string>();
  for(const field of fields){
    if(field.destination!=='shopping')continue;
    for(const block of field.blocks){
      const url=urlOnlyTitleSeed(block);if(!url||seen.has(url.href))continue;
      seen.add(url.href);candidates.push({block,url});
      if(candidates.length>=MAX_PRODUCT_LINK_PREVIEWS)break;
    }
    if(candidates.length>=MAX_PRODUCT_LINK_PREVIEWS)break;
  }
  const previews=await Promise.all(candidates.map(candidate=>fetchProductLinkPreview(candidate.url.href,fetchImpl).catch(()=>null)));
  let attached=0;
  previews.forEach((preview,index)=>{if(preview){candidates[index].block.productLinkPreview=preview;attached++;}});
  return attached;
}
