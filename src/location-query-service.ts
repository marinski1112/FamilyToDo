import { isValidLatitude, isValidLongitude } from './location-domain';
import type {
  LatestLocationQuery,
  LocationHistoryQuery,
  LocationPoint,
  LocationQueryService,
  LocationScope,
} from './location-providers';

const DEFAULT_HISTORY_LIMIT=250;
const MAX_HISTORY_LIMIT=500;
const MAX_BATCH_SUBJECTS=12;

type LocationRow=Readonly<{
  latitude:number;
  longitude:number;
  recorded_at:string;
  accuracy_meters:number|null;
}>;
type BatchedLocationRow=LocationRow&Readonly<{
  member_id:number;
  id:number;
}>;

const validPositiveId=(value:number):boolean=>Number.isSafeInteger(value)&&value>0;

const canonicalIso=(value:string):boolean=>{
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)&&new Date(parsed).toISOString()===value;
};

const toLocationPoint=(row:LocationRow):LocationPoint|null=>{
  if(!isValidLatitude(row.latitude)||!isValidLongitude(row.longitude)||!canonicalIso(row.recorded_at))return null;
  if(row.accuracy_meters!==null&&(!Number.isFinite(row.accuracy_meters)||row.accuracy_meters<0))return null;
  return {
    latitude:row.latitude,
    longitude:row.longitude,
    recordedAt:row.recorded_at,
    ...(row.accuracy_meters===null?{}:{accuracyMeters:row.accuracy_meters}),
  };
};

const validScope=(familyId:number,requesterMemberId:number,subjectMemberId:number):boolean=>
  validPositiveId(familyId)&&validPositiveId(requesterMemberId)&&validPositiveId(subjectMemberId);

const historyLimit=(value:number|undefined):number|null=>{
  if(value===undefined)return DEFAULT_HISTORY_LIMIT;
  if(!Number.isSafeInteger(value)||value<=0)return null;
  return Math.min(value,MAX_HISTORY_LIMIT);
};

/**
 * D1-backed provider-neutral Location reads.
 *
 * Every query proves that both requester and subject are active members of the
 * supplied family and that each returned coordinate still belongs to an
 * enabled, explicitly sharing, non-revoked source device. Cross-family rows and
 * retained coordinates from paused/revoked devices therefore fail closed.
 * History returns the newest bounded points in the requested interval,
 * re-sorted chronologically for map rendering; no unbounded raw history is
 * exposed.
 */
export class D1LocationQueryService implements LocationQueryService{
  constructor(private readonly db:D1Database){}

  async latest(query:LatestLocationQuery):Promise<LocationPoint|null>{
    const {familyId,requesterMemberId}=query.scope;
    const subjectMemberId=query.subjectMemberId;
    if(!validScope(familyId,requesterMemberId,subjectMemberId))return null;

    const row=await this.db.prepare(`
      SELECT l.latitude,l.longitude,l.recorded_at,l.accuracy_meters
      FROM member_location_latest l
      JOIN members subject
        ON subject.id=l.member_id
        AND subject.family_id=l.family_id
        AND subject.active=1
      JOIN location_devices device
        ON device.id=l.device_id
        AND device.family_id=l.family_id
        AND device.member_id=l.member_id
        AND device.enabled=1
        AND device.sharing_enabled=1
        AND device.revoked_at IS NULL
      WHERE l.family_id=? AND l.member_id=?
        AND EXISTS (
          SELECT 1 FROM members requester
          WHERE requester.id=? AND requester.family_id=? AND requester.active=1
        )
      LIMIT 1
    `).bind(
      familyId,subjectMemberId,requesterMemberId,familyId,
    ).first<LocationRow>();

    return row?toLocationPoint(row):null;
  }

  async history(query:LocationHistoryQuery):Promise<readonly LocationPoint[]>{
    const {familyId,requesterMemberId}=query.scope;
    const subjectMemberId=query.subjectMemberId;
    const limit=historyLimit(query.limit);
    if(!validScope(familyId,requesterMemberId,subjectMemberId)||limit===null)return [];
    if(!canonicalIso(query.from)||!canonicalIso(query.to)||query.from>query.to)return [];

    const result=await this.db.prepare(`
      SELECT latitude,longitude,recorded_at,accuracy_meters
      FROM (
        SELECT h.id,h.latitude,h.longitude,h.recorded_at,h.accuracy_meters
        FROM member_location_history h
        JOIN members subject
          ON subject.id=h.member_id
          AND subject.family_id=h.family_id
          AND subject.active=1
        JOIN location_devices device
          ON device.id=h.device_id
          AND device.family_id=h.family_id
          AND device.member_id=h.member_id
          AND device.enabled=1
          AND device.sharing_enabled=1
          AND device.revoked_at IS NULL
        WHERE h.family_id=? AND h.member_id=?
          AND h.recorded_at>=? AND h.recorded_at<=?
          AND EXISTS (
            SELECT 1 FROM members requester
            WHERE requester.id=? AND requester.family_id=? AND requester.active=1
          )
        ORDER BY h.recorded_at DESC,h.id DESC
        LIMIT ?
      ) bounded
      ORDER BY recorded_at ASC,id ASC
    `).bind(
      familyId,subjectMemberId,query.from,query.to,
      requesterMemberId,familyId,limit,
    ).all<LocationRow>();

    const points:LocationPoint[]=[];
    for(const row of result.results){
      const point=toLocationPoint(row);
      if(point)points.push(point);
    }
    return points;
  }

  /**
   * Read several family members' bounded histories in one D1 statement.
   * This is intended for family-wide summaries where issuing one history()
   * statement per member would exceed an outer workflow's query budget.
   */
  async historyForSubjects(query:Readonly<{
    scope:LocationScope;
    subjectMemberIds:readonly number[];
    from:string;
    to:string;
    limitPerSubject?:number;
  }>):Promise<ReadonlyMap<number,readonly LocationPoint[]>>{
    const {familyId,requesterMemberId}=query.scope;
    const limit=historyLimit(query.limitPerSubject);
    const subjectMemberIds=[...new Set(query.subjectMemberIds.map(Number))];
    const empty=new Map<number,readonly LocationPoint[]>();
    if(!validPositiveId(familyId)||!validPositiveId(requesterMemberId)||limit===null)return empty;
    if(subjectMemberIds.length===0||subjectMemberIds.length>MAX_BATCH_SUBJECTS||subjectMemberIds.some(id=>!validPositiveId(id)))return empty;
    if(!canonicalIso(query.from)||!canonicalIso(query.to)||query.from>query.to)return empty;
    for(const id of subjectMemberIds)empty.set(id,[]);

    const placeholders=subjectMemberIds.map(()=>'?').join(',');
    const result=await this.db.prepare(`
      SELECT member_id,id,latitude,longitude,recorded_at,accuracy_meters
      FROM (
        SELECT h.member_id,h.id,h.latitude,h.longitude,h.recorded_at,h.accuracy_meters,
          ROW_NUMBER() OVER (
            PARTITION BY h.member_id
            ORDER BY h.recorded_at DESC,h.id DESC
          ) AS member_rank
        FROM member_location_history h
        JOIN members subject
          ON subject.id=h.member_id
          AND subject.family_id=h.family_id
          AND subject.active=1
        JOIN location_devices device
          ON device.id=h.device_id
          AND device.family_id=h.family_id
          AND device.member_id=h.member_id
          AND device.enabled=1
          AND device.sharing_enabled=1
          AND device.revoked_at IS NULL
        WHERE h.family_id=? AND h.member_id IN (${placeholders})
          AND h.recorded_at>=? AND h.recorded_at<=?
          AND EXISTS (
            SELECT 1 FROM members requester
            WHERE requester.id=? AND requester.family_id=? AND requester.active=1
          )
      ) bounded
      WHERE member_rank<=?
      ORDER BY member_id ASC,recorded_at ASC,id ASC
    `).bind(
      familyId,...subjectMemberIds,query.from,query.to,
      requesterMemberId,familyId,limit,
    ).all<BatchedLocationRow>();

    const grouped=new Map<number,LocationPoint[]>();
    for(const id of subjectMemberIds)grouped.set(id,[]);
    for(const row of result.results){
      const memberId=Number(row.member_id);
      const points=grouped.get(memberId);
      if(!points)continue;
      const point=toLocationPoint(row);
      if(point)points.push(point);
    }
    return grouped;
  }
}
