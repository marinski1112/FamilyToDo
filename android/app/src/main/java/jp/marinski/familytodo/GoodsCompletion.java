package jp.marinski.familytodo;

import org.json.JSONObject;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;

/** Web completionThreshold: JST midnight, with yesterday 23:00 grace until 01:00. */
final class GoodsCompletion {
    private static final ZoneOffset JST=ZoneOffset.ofHours(9);
    static long threshold(long now) {
        ZonedDateTime local=Instant.ofEpochMilli(now).atZone(JST);
        ZonedDateTime midnight=local.toLocalDate().atStartOfDay(JST);
        return (local.getHour()==0?midnight.minusHours(1):midnight).toInstant().toEpochMilli();
    }
    static long nextBoundary(long now) {
        ZonedDateTime local=Instant.ofEpochMilli(now).atZone(JST);
        ZonedDateTime midnight=local.toLocalDate().atStartOfDay(JST);
        return (local.getHour()==0?midnight.plusHours(1):midnight.plusDays(1)).toInstant().toEpochMilli();
    }
    static boolean visible(JSONObject row,long now) {
        if(!"completed".equals(row.optString("status")))return true;
        String raw="";
        for(String key:new String[]{"completed_at","updated_at","created_at"}) {
            if(!row.isNull(key)&&!row.optString(key).isEmpty()){raw=row.optString(key);break;}
        }
        // Old overview servers omit all timestamps; retain their supplied rows.
        if(raw.isEmpty())return true;
        raw=raw.replace(' ','T');
        try {
            Instant instant=raw.matches(".*(?:Z|[+-]\\d{2}:\\d{2})$")?OffsetDateTime.parse(raw).toInstant():LocalDateTime.parse(raw).toInstant(JST);
            return instant.toEpochMilli()>=threshold(now);
        } catch(java.time.DateTimeException error){return false;}
    }
}
