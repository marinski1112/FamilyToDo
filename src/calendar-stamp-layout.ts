import type { CalendarStampPlacement } from './calendar-stamps';

export type CalendarStampDayLayoutInput = {
  scheduleRows: number;
  multiDayBands: number;
  stampCount: number;
};

export type CalendarStampDayLayout = {
  hasStamp: boolean;
  visibleStampCount: 0 | 1;
  visibleMultiDayBands: number;
  visibleScheduleRows: number;
  overflowCount: number;
};

const MAX_COUNT=10000;

function boundedCount(value:number,label:string):number{
  if(!Number.isSafeInteger(value)||value<0||value>MAX_COUNT)throw new Error(`invalid ${label}`);
  return value;
}

/**
 * Pure month-cell capacity projection for the future Calendar renderer.
 * Multi-day bands consume schedule-row capacity before ordinary rows. A day with
 * at least one stamp reserves the second visual slot for one stamp thumbnail.
 * This helper is intentionally renderer-independent while Calendar 1102 remains
 * trace-driven.
 */
export function projectCalendarStampDayLayout(input:CalendarStampDayLayoutInput):CalendarStampDayLayout{
  const scheduleRows=boundedCount(input.scheduleRows,'calendar schedule rows');
  const multiDayBands=boundedCount(input.multiDayBands,'calendar multi-day bands');
  const stampCount=boundedCount(input.stampCount,'calendar stamp count');
  const hasStamp=stampCount>0;
  const scheduleCapacity=hasStamp?1:2;
  const visibleMultiDayBands=Math.min(multiDayBands,scheduleCapacity);
  const remainingCapacity=scheduleCapacity-visibleMultiDayBands;
  const visibleScheduleRows=Math.min(scheduleRows,remainingCapacity);
  const overflowCount=(multiDayBands-visibleMultiDayBands)+(scheduleRows-visibleScheduleRows);
  return {
    hasStamp,
    visibleStampCount:hasStamp?1:0,
    visibleMultiDayBands,
    visibleScheduleRows,
    overflowCount,
  };
}

/**
 * The range read model is already ordered by date, sort_order, placement id.
 * Keep one thumbnail candidate per date without exposing additional identifiers
 * or mutating the retained placement rows.
 */
export function primaryCalendarStampByDate(placements:readonly CalendarStampPlacement[]):Map<string,CalendarStampPlacement>{
  const out=new Map<string,CalendarStampPlacement>();
  for(const placement of placements){
    if(!out.has(placement.stamp_date))out.set(placement.stamp_date,placement);
  }
  return out;
}

export const CALENDAR_STAMP_LAYOUT_LIMITS={maxCount:MAX_COUNT} as const;
