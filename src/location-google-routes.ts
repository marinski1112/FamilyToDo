import type { RouteProvider,RouteRequest,RouteSummary } from './location-providers';

const ROUTES_URL='https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK='routes.duration,routes.distanceMeters';

function parseDurationSeconds(value:unknown):number|undefined{
  if(typeof value!=='string')return undefined;
  const match=/^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if(!match)return undefined;
  const seconds=Math.ceil(Number(match[1]));
  return Number.isFinite(seconds)&&seconds>=0?seconds:undefined;
}

/** Server-only Google Routes adapter. Coordinates are sent in the POST body,
 * never in a URL or application log, and only the two summary fields are read. */
export class GoogleRoutesProvider implements RouteProvider{
  constructor(private readonly apiKey:string){}

  async route(request:RouteRequest):Promise<RouteSummary>{
    if(!this.apiKey)throw new Error('ROUTES_NOT_CONFIGURED');
    if(request.mode&&request.mode!=='drive')throw new Error('ROUTE_MODE_UNSUPPORTED');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),4500);
    try{
      const response=await fetch(ROUTES_URL,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-goog-api-key':this.apiKey,
          'x-goog-fieldmask':FIELD_MASK,
        },
        body:JSON.stringify({
          origin:{location:{latLng:{latitude:request.origin.latitude,longitude:request.origin.longitude}}},
          destination:{location:{latLng:{latitude:request.destination.latitude,longitude:request.destination.longitude}}},
          travelMode:'DRIVE',
          computeAlternativeRoutes:false,
          languageCode:'ja',
          units:'METRIC',
        }),
        signal:controller.signal,
      });
      if(!response.ok)throw new Error('ROUTES_PROVIDER_FAILED');
      const payload=await response.json() as {routes?:Array<{duration?:unknown;distanceMeters?:unknown}>};
      const first=payload.routes?.[0];
      const distanceMeters=Number(first?.distanceMeters);
      const durationSeconds=parseDurationSeconds(first?.duration);
      if(!Number.isFinite(distanceMeters)||distanceMeters<0||durationSeconds===undefined)throw new Error('ROUTES_PROVIDER_INVALID_RESPONSE');
      return {distanceMeters:Math.round(distanceMeters),durationSeconds};
    }catch(error){
      if(error instanceof Error&&error.name==='AbortError')throw new Error('ROUTES_PROVIDER_TIMEOUT');
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }
}
