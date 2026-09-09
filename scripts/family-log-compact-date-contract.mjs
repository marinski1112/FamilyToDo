import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const ui=await readFile(new URL('../public/assets/family-log-compact-ui.js',import.meta.url),'utf8');
const css=await readFile(new URL('../public/assets/family-log-layout.css',import.meta.url),'utf8');

assert.ok(
  ui.includes('return `${match[1].slice(-2)}.${Number(match[2])}.${Number(match[3])}`;'),
  'Family Log visible date must keep year, month and day in a compact full-date label such as 26.9.20',
);
assert.ok(!ui.includes('return `${Number(match[2])}/${Number(match[3])}`;'),'Family Log compact date must not fall back to month/day-only text');
assert.ok(css.includes('grid-template-columns:26px 80px 26px'),'Family Log compact toolbar must retain the bounded 80px date slot');
assert.ok(css.includes('.family-log-visible-date{display:block!important;position:relative;z-index:2;'),'custom visible date label must render above the native date input');
assert.ok(css.includes('z-index:1;opacity:1;cursor:pointer;background:#fff;color:transparent;-webkit-text-fill-color:transparent'),'native date input must stay opaque/tappable while its clipped browser-rendered text is suppressed');
assert.ok(css.includes('input[type="date"]::-webkit-datetime-edit{color:transparent;-webkit-text-fill-color:transparent}'),'WebKit date edit text must be suppressed under the explicit visible label');
assert.ok(css.includes('input[type="date"]::-webkit-date-and-time-value{color:transparent;-webkit-text-fill-color:transparent}'),'iOS WebKit date value text must be suppressed under the explicit visible label');
assert.ok(!css.includes('opacity:0;cursor:pointer'),'native Family Log date input must not become an invisible/non-regression-tested control');

console.log('family-log-compact-date-contract: compact full date visible; native date picker remains interactive');
