package jp.marinski.familytodo;

import org.json.JSONObject;
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
}
