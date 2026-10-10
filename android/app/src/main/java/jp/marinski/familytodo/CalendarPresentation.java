package jp.marinski.familytodo;

import org.json.JSONObject;
import org.json.JSONArray;
import java.util.List;
import java.util.Set;
import java.util.HashSet;
import java.util.Map;
import java.util.HashMap;
import java.text.Normalizer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Mirrors calendarDisplayLabel and single-day ordering in the Web calendar. */
final class CalendarPresentation {
    private static final Pattern PREFIX=Pattern.compile("^\\s*(\\d{1,2}):(\\d{2})(?:\\s*[-~～〜–—])?\\s*");
    static String label(JSONObject task,boolean includeTime) {
        String title=task.optString("title", ""),at=task.optString("start_at", "");
        String time=at.length()>=16?at.substring(11,16):"";
        if(!includeTime||task.optInt("all_day")==1||!time.matches("\\d{2}:\\d{2}"))return title;
        String normalized=Normalizer.normalize(title,Normalizer.Form.NFKC),display=title;
        Matcher match=PREFIX.matcher(normalized);
        if(match.find()&&String.format(java.util.Locale.ROOT,"%02d:%s",Integer.parseInt(match.group(1)),match.group(2)).equals(time)) {
            String remainder=normalized.substring(match.end());
            if(!remainder.isEmpty())display=remainder;
        }
        return time+" "+display;
    }
    static int compare(JSONObject left,JSONObject right) {
        int order=Double.compare(left.optDouble("sort_order",0),right.optDouble("sort_order",0));
        return order!=0?order:Long.compare(left.optLong("id"),right.optLong("id"));
    }
    static int checklistCount(List<JSONObject> rows,JSONArray undated) {
        Set<Long> datedParents=new HashSet<>();Map<Long,Integer> undatedByParent=new HashMap<>();
        for(JSONObject row:rows)if(row.optLong("parent_task_id")>0)datedParents.add(row.optLong("parent_task_id"));
        if(undated!=null)for(int i=0;i<undated.length();i++) {
            JSONObject child=undated.optJSONObject(i);if(child==null)continue;
            long parent=child.optLong("parent_task_id");undatedByParent.put(parent,undatedByParent.getOrDefault(parent,0)+1);
        }
        int count=0;
        for(JSONObject row:rows) {
            if(row.optLong("parent_task_id")>0)count++;
            else {
                long id=row.optLong("id");
                if(!datedParents.contains(id)&&!undatedByParent.containsKey(id))count++;
                count+=undatedByParent.getOrDefault(id,0);
            }
        }
        return count;
    }
}
