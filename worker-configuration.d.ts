interface D1PreparedStatement { bind(...values: unknown[]): D1PreparedStatement; all<T=Record<string,unknown>>(): Promise<{results:T[];meta:any}>; first<T=Record<string,unknown>>(columnName?: string): Promise<T|null>; run<T=Record<string,unknown>>(): Promise<{results:T[];meta:any}>; }
interface D1Database { prepare(sql:string): D1PreparedStatement; batch(stmts:D1PreparedStatement[]): Promise<Array<{results:any[];meta:any}>>; }
interface Fetcher { fetch(request:Request): Promise<Response>; }
interface ScheduledController { cron:string; }
interface ExecutionContext { waitUntil(promise:Promise<any>):void; passThroughOnException():void; }
type ExportedHandler<E> = { fetch(request:Request,env:E,ctx:ExecutionContext):Promise<Response>; scheduled?(controller:ScheduledController,env:E,ctx:ExecutionContext):Promise<void>; };
interface Env { DB:D1Database; ASSETS:Fetcher; APP_NAME:string; APP_URL:string; APP_TIMEZONE:string; NOTIFY_MODE:string; ENVIRONMENT:string; LINE_CHANNEL_SECRET:string; LINE_CHANNEL_ID:string; LINE_LIFF_ID:string; LINE_ACCESS_TOKEN:string; APP_SECRET:string; NOTIFY_SECRET:string; }
