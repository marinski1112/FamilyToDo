import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const sources=[];
async function walk(dir){for(const name of await readdir(dir)){if(['.git','node_modules','public'].includes(name))continue;const path=resolve(dir,name);const info=await stat(path);if(info.isDirectory())await walk(path);else if(/\.(?:ts|js|mjs|html)$/.test(name))sources.push(path);}}
await walk(root);
const missing=[];
for(const source of sources){const text=await readFile(source,'utf8');for(const match of text.matchAll(/["'`](\/assets\/[^"'`?#\s]+\.(?:js|css))(?:\?[^"'`\s]*)?["'`]/g)){const asset=resolve(root,'public',match[1].slice(1));try{if(!(await stat(asset)).isFile())missing.push(`${relative(root,source)}: ${match[1]}`);}catch{missing.push(`${relative(root,source)}: ${match[1]}`);}}}
if(missing.length){console.error('Missing static assets:\n'+missing.join('\n'));process.exit(1);}console.log(`static asset references: ok (${sources.length} source files)`);
