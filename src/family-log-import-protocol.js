export const FAMILY_LOG_IMPORT_CHUNK_SIZE=100;

export function chunkPlan(recordCount,chunkSize=FAMILY_LOG_IMPORT_CHUNK_SIZE){
  if(!Number.isInteger(recordCount)||recordCount<0||!Number.isInteger(chunkSize)||chunkSize<1)throw new Error('invalid import plan');
  const result=[];
  for(let offset=0;offset<recordCount;offset+=chunkSize)result.push({offset,length:Math.min(chunkSize,recordCount-offset)});
  return result;
}

export function validateChunkOffset(processedCount,recordCount,offset,length){
  if(![processedCount,recordCount,offset,length].every(Number.isInteger)||processedCount<0||recordCount<0||processedCount>recordCount||offset<0||length<1||length>FAMILY_LOG_IMPORT_CHUNK_SIZE||offset+length>recordCount)throw new Error('chunk range is invalid');
  if(offset===processedCount)return {retry:false,nextProcessedCount:offset+length};
  if(offset<processedCount&&offset+length<=processedCount)return {retry:true,nextProcessedCount:processedCount};
  throw new Error('chunk offset must continue from processed_count');
}

export function validateFinishCounts(status,rolledBack,processedCount,recordCount,importedCount,skippedCount,errorCount){
  if(rolledBack||!['IMPORTING','FAILED'].includes(String(status)))throw new Error('batch status cannot finish');
  if(![processedCount,recordCount,importedCount,skippedCount,errorCount].every(Number.isInteger)||processedCount<0||recordCount<0||processedCount>recordCount)throw new Error('batch count is invalid');
  if(processedCount!==recordCount)throw new Error('unprocessed chunks remain');
  if(importedCount+skippedCount+errorCount!==recordCount)throw new Error('batch outcome counts do not match record_count');
  return true;
}
