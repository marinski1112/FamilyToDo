import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/task-rough-input-api.ts',import.meta.url),'utf8');
const required=[
  ['semantic block parser','function semanticBlocks(text:string)'],
  ['indented continuation gate',"/^\\s/.test(line.raw)"],
  ['metadata continuation gate','metadataPrefix.test(line.trimmed)'],
  ['URL continuation gate','httpUrlOnly.test(line.trimmed)'],
  ['raw block provenance',"originalText:lines.join('\\n')"],
  ['explicit quantity extraction','function explicitQuantity(block:RoughBlock)'],
  ['task/event continuation description','function continuationDescription(block:RoughBlock,destination:Destination)'],
  ['server line budget','totalLines>MAX_ITEMS'],
  ['Gemini block payload','blocks:field.blocks.map(block=>block.originalText)'],
  ['editable draft confirmation','requiresConfirmation:true'],
];
for(const [name,needle] of required){
  if(!source.includes(needle))throw new Error(`missing ${name}: ${needle}`);
}
if(source.includes('fields.flatMap(field=>field.lines.map('))throw new Error('legacy one-line=one-item deterministic parser still active');
if(!source.includes("if(description!==null&&field.destination!=='task'&&field.destination!=='event')return null;"))throw new Error('description destination guard missing');
console.log('task rough-input semantic-block contract ok');
