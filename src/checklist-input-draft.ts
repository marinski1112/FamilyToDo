export const CHECKLIST_INPUT_MAX_CHARS=4000;
export const CHECKLIST_INPUT_MAX_ITEMS=20;
export const CHECKLIST_INPUT_SCHEMA_VERSION=1 as const;

export type ChecklistDraftIntent='task'|'shopping'|'unknown';
export type ChecklistDraftSource='deterministic'|'gemini';

export type ChecklistDraftItem={
  originalText:string;
  title:string;
  intent:ChecklistDraftIntent;
  category:string|null;
  dueDate:string|null;
  dueTime:string|null;
  groupHint:string|null;
  confidence:number|null;
};

export type ChecklistInputDraft={
  schemaVersion:typeof CHECKLIST_INPUT_SCHEMA_VERSION;
  originalText:string;
  source:ChecklistDraftSource;
  requiresConfirmation:true;
  items:ChecklistDraftItem[];
};

export const CHECKLIST_INPUT_DRAFT_JSON_SCHEMA={
  type:'object',
  additionalProperties:false,
  required:['schemaVersion','originalText','source','requiresConfirmation','items'],
  properties:{
    schemaVersion:{type:'integer',enum:[CHECKLIST_INPUT_SCHEMA_VERSION]},
    originalText:{type:'string',maxLength:CHECKLIST_INPUT_MAX_CHARS},
    source:{type:'string',enum:['deterministic','gemini']},
    requiresConfirmation:{type:'boolean',enum:[true]},
    items:{
      type:'array',maxItems:CHECKLIST_INPUT_MAX_ITEMS,
      items:{
        type:'object',additionalProperties:false,
        required:['originalText','title','intent','category','dueDate','dueTime','groupHint','confidence'],
        properties:{
          originalText:{type:'string',minLength:1,maxLength:500},
          title:{type:'string',minLength:1,maxLength:200},
          intent:{type:'string',enum:['task','shopping','unknown']},
          category:{type:['string','null'],maxLength:100},
          dueDate:{type:['string','null'],pattern:'^\\d{4}-\\d{2}-\\d{2}$'},
          dueTime:{type:['string','null'],pattern:'^(?:[01]\\d|2[0-3]):[0-5]\\d$'},
          groupHint:{type:['string','null'],maxLength:100},
          confidence:{type:['number','null'],minimum:0,maximum:1},
        },
      },
    },
  },
} as const;

export class ChecklistInputDraftError extends Error{
  constructor(public readonly code:'INPUT_TOO_LONG'|'TOO_MANY_ITEMS'|'INVALID_DRAFT'){
    super(code);
    this.name='ChecklistInputDraftError';
  }
}

const OWN_KEYS=['schemaVersion','originalText','source','requiresConfirmation','items'] as const;
const ITEM_KEYS=['originalText','title','intent','category','dueDate','dueTime','groupHint','confidence'] as const;
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const TIME_RE=/^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isPlainRecord(value:unknown):value is Record<string,unknown>{
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
}
function hasOnlyKeys(value:Record<string,unknown>,keys:readonly string[]):boolean{
  const actual=Object.keys(value);
  return actual.length===keys.length&&actual.every((key)=>keys.includes(key));
}
function nullableBoundedString(value:unknown,max:number):value is string|null{
  return value===null||(typeof value==='string'&&value.length<=max);
}
function validDate(value:unknown):value is string|null{
  if(value===null)return true;
  if(typeof value!=='string'||!DATE_RE.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}
function validItem(value:unknown):value is ChecklistDraftItem{
  if(!isPlainRecord(value)||!hasOnlyKeys(value,ITEM_KEYS))return false;
  if(typeof value.originalText!=='string'||value.originalText.length<1||value.originalText.length>500)return false;
  if(typeof value.title!=='string'||value.title.length<1||value.title.length>200)return false;
  if(value.intent!=='task'&&value.intent!=='shopping'&&value.intent!=='unknown')return false;
  if(!nullableBoundedString(value.category,100)||!validDate(value.dueDate))return false;
  if(value.dueTime!==null&&(typeof value.dueTime!=='string'||!TIME_RE.test(value.dueTime)))return false;
  if(!nullableBoundedString(value.groupHint,100))return false;
  if(value.confidence!==null&&(typeof value.confidence!=='number'||!Number.isFinite(value.confidence)||value.confidence<0||value.confidence>1))return false;
  return true;
}

export function validateChecklistInputDraft(value:unknown,expectedOriginalText?:string):ChecklistInputDraft{
  if(!isPlainRecord(value)||!hasOnlyKeys(value,OWN_KEYS))throw new ChecklistInputDraftError('INVALID_DRAFT');
  if(value.schemaVersion!==CHECKLIST_INPUT_SCHEMA_VERSION||typeof value.originalText!=='string'||value.originalText.length>CHECKLIST_INPUT_MAX_CHARS)throw new ChecklistInputDraftError('INVALID_DRAFT');
  if(expectedOriginalText!==undefined&&value.originalText!==expectedOriginalText)throw new ChecklistInputDraftError('INVALID_DRAFT');
  if(value.source!=='deterministic'&&value.source!=='gemini')throw new ChecklistInputDraftError('INVALID_DRAFT');
  if(value.requiresConfirmation!==true||!Array.isArray(value.items)||value.items.length>CHECKLIST_INPUT_MAX_ITEMS||!value.items.every(validItem))throw new ChecklistInputDraftError('INVALID_DRAFT');
  return value as ChecklistInputDraft;
}

const EXPLICIT_PREFIXES:[RegExp,ChecklistDraftIntent][]=[
  [/^(?:買い物|買うもの|購入)\s*[:：]\s*/u,'shopping'],
  [/^(?:タスク|todo|やること)\s*[:：]\s*/iu,'task'],
];

function parseExplicitLine(originalText:string):ChecklistDraftItem{
  let title=originalText.trim();
  let intent:ChecklistDraftIntent='unknown';
  let confidence:number|null=null;
  for(const [pattern,candidate] of EXPLICIT_PREFIXES){
    if(pattern.test(title)){
      title=title.replace(pattern,'').trim();
      intent=candidate;
      confidence=1;
      break;
    }
  }
  return {originalText,title,intent,category:null,dueDate:null,dueTime:null,groupHint:null,confidence};
}

export function createDeterministicChecklistInputDraft(originalText:string):ChecklistInputDraft{
  if(originalText.length>CHECKLIST_INPUT_MAX_CHARS)throw new ChecklistInputDraftError('INPUT_TOO_LONG');
  const sourceLines=originalText.replace(/\r\n?/g,'\n').split('\n').map((line)=>line.trim()).filter(Boolean);
  if(sourceLines.length>CHECKLIST_INPUT_MAX_ITEMS)throw new ChecklistInputDraftError('TOO_MANY_ITEMS');
  const items=sourceLines.map(parseExplicitLine).filter((item)=>item.title.length>0);
  return validateChecklistInputDraft({schemaVersion:CHECKLIST_INPUT_SCHEMA_VERSION,originalText,source:'deterministic',requiresConfirmation:true,items},originalText);
}
