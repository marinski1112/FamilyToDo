package jp.marinski.familytodo;

import java.time.OffsetDateTime;
import java.time.ZoneId;

/** Same JST boundary as public/assets/goods-category-controller.js. */
final class GoodsCategoryState {
    static long archiveAt(String activatedAt) {
        try {
            java.time.ZonedDateTime at=OffsetDateTime.parse(activatedAt).atZoneSameInstant(ZoneId.of("Asia/Tokyo"));
            return at.toLocalDate().plusDays(1).atTime(at.getHour()>=23?1:0,0)
                .atZone(ZoneId.of("Asia/Tokyo")).toInstant().toEpochMilli();
        } catch (RuntimeException invalid) { return 0; }
    }
    static String state(int enabled,int count,String activatedAt,long now) {
        if(enabled==0)return "DISABLED";
        if(count>0)return "ACTIVE";
        return archiveAt(activatedAt)>now?"FRESH_EMPTY":"ARCHIVED_EMPTY";
    }
}
