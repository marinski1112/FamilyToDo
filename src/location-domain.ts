export type LocationPrivacyDefaults=Readonly<{
  sharingEnabled:false;
  ingestEnabled:false;
  persistLatest:false;
  persistHistory:false;
}>;

/**
 * Location starts fully opt-in. Later OwnTracks/API work must explicitly cross
 * this boundary instead of inferring consent from an authenticated session.
 */
export const LOCATION_PRIVACY_DEFAULTS:LocationPrivacyDefaults=Object.freeze({
  sharingEnabled:false,
  ingestEnabled:false,
  persistLatest:false,
  persistHistory:false,
});

/**
 * Sensor identity is kept at the ingestion boundary. Domain consumers must not
 * depend on provider-specific payloads, so future Android collection can reuse
 * the same latest/history/query contracts as OwnTracks.
 */
export type LocationProvider='OWNTRACKS'|'FAMILYTODO_ANDROID';

export type LocationTrigger='PING'|'MOVE'|'ENTER'|'LEAVE'|'MANUAL'|'UNKNOWN';

/**
 * Canonical provider-neutral point produced after provider payload validation.
 * `recordedAt` is the sensor timestamp and `receivedAt` is the Worker receipt
 * timestamp. Optional telemetry is omitted when the provider does not supply a
 * trustworthy value; raw provider JSON never belongs in this shape.
 */
export type NormalizedLocationPoint=Readonly<{
  provider:LocationProvider;
  familyId:number;
  memberId:number;
  deviceId:string;
  latitude:number;
  longitude:number;
  recordedAt:string;
  receivedAt:string;
  trigger:LocationTrigger;
  accuracyMeters?:number;
  altitudeMeters?:number;
  speedMetersPerSecond?:number;
  headingDegrees?:number;
  batteryPercent?:number;
}>;

/** Latitude/longitude guards are shared by provider adapters before persistence. */
export const isValidLatitude=(value:number):boolean=>Number.isFinite(value)&&value>=-90&&value<=90;
export const isValidLongitude=(value:number):boolean=>Number.isFinite(value)&&value>=-180&&value<=180;

export type LocationRoadmapItem=Readonly<{
  key:'owntracks'|'latest'|'history'|'places'|'distance';
  label:string;
  enabled:false;
}>;

/** UI-only roadmap for the first shell; none of these capabilities execute yet. */
export const LOCATION_ROADMAP:readonly LocationRoadmapItem[]=Object.freeze([
  {key:'owntracks',label:'OwnTracks 端末連携',enabled:false},
  {key:'latest',label:'最新位置',enabled:false},
  {key:'history',label:'移動履歴',enabled:false},
  {key:'places',label:'場所・滞在',enabled:false},
  {key:'distance',label:'現在地からの距離',enabled:false},
]);
