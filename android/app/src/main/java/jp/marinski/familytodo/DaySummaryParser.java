package jp.marinski.familytodo;

import android.text.Html;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Bounded display-only adapter for the canonical authenticated day journal. No HTML execution. */
final class DaySummaryParser {
    private static Matcher match(String pattern,String html){return Pattern.compile(pattern,Pattern.DOTALL).matcher(html);}
    private static String text(String html){
        String safe=html.replaceAll("(?is)<(script|style)\\b[^>]*>.*?</\\1>","").replaceAll("(?is)<img\\b[^>]*>","");
        return Html.fromHtml(safe,Html.FROM_HTML_MODE_LEGACY).toString().trim();
    }
    static String path(LocalDate date){return "/app/family_journal.php?view=day&date="+date;}
    static boolean checklistRedirect(String location,LocalDate date){return ("/app/tasks.php?date="+date).equals(location);}
    static boolean safeLink(String href){
        return href.matches("/task/view\\.php\\?id=[1-9][0-9]*")||href.matches("/app/tasks\\.php\\?date=\\d{4}-\\d{2}-\\d{2}")||
            href.matches("/app/family_log\\.php\\?date=\\d{4}-\\d{2}-\\d{2}")||href.matches("/app/meals\\.php\\?view=week&week=\\d{4}-\\d{2}-\\d{2}")||
            href.matches("/api/family-log-media\\?media=[1-9][0-9]*");
    }
    static JSONObject parse(String html,LocalDate date)throws Exception{
        if(html.length()>512000)throw new IllegalStateException("Journal too large");
        Matcher head=match("<div class=\"daily-head\">(.*?)</div></div>",html);
        if(!head.find()||!text(head.group(1)).contains("その日の総括")||!head.group(1).contains("<strong>"+date+"</strong>"))throw new IllegalStateException("Journal contract changed");
        Matcher today=match("href=\"/app/tasks\\.php\\?date=(\\d{4}-\\d{2}-\\d{2})\">今日</a>",head.group(1));
        if(!today.find())throw new IllegalStateException("Journal today missing");
        LocalDate.parse(today.group(1));
        JSONArray cards=new JSONArray();boolean plans=false,meals=false,logs=false;
        Matcher sections=match("<section class=\"card\"[^>]*>(.*?)</section>",html);
        while(sections.find()){
            if(cards.length()>=32)throw new IllegalStateException("Too many journal sections");
            String block=sections.group(1);Matcher heading=match("<h2>(.*?)</h2>",block);if(!heading.find())throw new IllegalStateException("Journal heading missing");
            String title=text(heading.group(1));plans|=title.startsWith("📅");meals|=title.equals("🍚 献立");logs|=title.equals("👪 家族ログ");
            String body=text(block.substring(heading.end()));boolean truncated=body.length()>24000;if(truncated)body=body.substring(0,24000)+"\n続きはWeb版の日誌で確認してください。";
            JSONArray links=new JSONArray();Matcher link=match("<a\\b[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>",block);
            while(link.find()&&links.length()<100){String href=text(link.group(1)),label=text(link.group(2));if(safeLink(href)&&!label.isEmpty())links.put(new JSONObject().put("path",href).put("label",label));}
            cards.put(new JSONObject().put("title",title).put("text",body).put("links",links));
        }
        if(!plans||!meals||!logs)throw new IllegalStateException("Journal sections changed");
        return new JSONObject().put("kind","SUMMARY").put("date",date.toString()).put("today",today.group(1)).put("cards",cards);
    }
}
