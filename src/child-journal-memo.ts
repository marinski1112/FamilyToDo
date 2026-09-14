/** Shared validation for explicit growth-diary text, including imported text. */
export function childJournalMemo(title:unknown,note:unknown){
  if(typeof title!=='string'||note!=null&&typeof note!=='string')return null;
  const valueText=title.trim(),text=String(note??'').trim();
  if(!valueText||valueText.length>120||text.length>2000)return null;
  return {valueText,note:text||null};
}
