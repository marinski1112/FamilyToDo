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
