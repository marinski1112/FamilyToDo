export type LocationScope=Readonly<{
  familyId:number;
  requesterMemberId:number;
}>;

export type LocationPoint=Readonly<{
  latitude:number;
  longitude:number;
  recordedAt:string;
  accuracyMeters?:number;
}>;

export type LatestLocationQuery=Readonly<{
  scope:LocationScope;
  subjectMemberId:number;
}>;

export type LocationHistoryQuery=Readonly<{
  scope:LocationScope;
  subjectMemberId:number;
  from:string;
  to:string;
  limit?:number;
}>;

export interface LocationQueryService{
  latest(query:LatestLocationQuery):Promise<LocationPoint|null>;
  history(query:LocationHistoryQuery):Promise<readonly LocationPoint[]>;
}

export type MapLinkRequest=Readonly<{
  scope:LocationScope;
  point:LocationPoint;
  label?:string;
}>;

export interface MapProvider{
  link(request:MapLinkRequest):Promise<string>;
}

export type RouteRequest=Readonly<{
  scope:LocationScope;
  origin:LocationPoint;
  destination:LocationPoint;
  mode?:'walk'|'drive'|'bicycle'|'transit';
}>;

export type RouteSummary=Readonly<{
  distanceMeters:number;
  durationSeconds?:number;
}>;

export interface RouteProvider{
  route(request:RouteRequest):Promise<RouteSummary>;
}

export type VoiceMessageRequest=Readonly<{
  scope:LocationScope;
  message:string;
  target?:string;
}>;

export type VoiceDeliveryResult=Readonly<{
  delivered:boolean;
  providerMessageId?:string;
}>;

export interface VoiceProvider{
  deliver(request:VoiceMessageRequest):Promise<VoiceDeliveryResult>;
}
