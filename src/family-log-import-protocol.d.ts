export const FAMILY_LOG_IMPORT_CHUNK_SIZE:number;
export function chunkPlan(recordCount:number,chunkSize?:number):Array<{offset:number;length:number}>;
export function validateChunkOffset(processedCount:number,recordCount:number,offset:number,length:number):{retry:boolean;nextProcessedCount:number};
export function validateFinishCounts(status:unknown,rolledBack:boolean,processedCount:number,recordCount:number,importedCount:number,skippedCount:number,errorCount:number):boolean;
