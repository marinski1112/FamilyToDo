package jp.marinski.familytodo;

import android.text.Html;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reads display values from the canonical authenticated Web dashboard; never runs scripts. */
final class HomeDashboardParser {
    private static Matcher match(String pattern,String html) {
        return Pattern.compile(pattern,Pattern.DOTALL).matcher(html);
    }
    private static String group(String pattern,String html) {
        Matcher matcher=match(pattern,html);return matcher.find()?matcher.group(1):"";
    }
    private static String text(String html) {
        return Html.fromHtml(html,Html.FROM_HTML_MODE_LEGACY).toString().trim();
    }
    static JSONObject parse(String html) throws Exception {
        if(html==null||!html.contains("class=\"home-dashboard\""))throw new IllegalStateException("Home dashboard unavailable");
        String hero=group("<header class=\"home-dashboard-hero\">(.*?)</header>",html);
        String grid=group("<section class=\"home-today-grid\">(.*?)</section>",html);
        JSONArray counts=new JSONArray();Matcher stats=match("<a class=\"home-stat\"[^>]*><strong>([0-9]+)</strong>",grid);
        while(stats.find())counts.put(Integer.parseInt(stats.group(1)));
        if(counts.length()!=4)throw new IllegalStateException("Home count contract changed");
        JSONObject result=new JSONObject().put("title",text(group("<h1>(.*?)</h1>",hero)))
            .put("greeting",text(group("<p>(.*?)</p>",hero))).put("counts",counts);
        String alertList=group("<section class=\"home-alert-list\">(.*?)</section>",html);
        JSONArray alerts=new JSONArray();Matcher alert=match("<a class=\"home-alert([^\"]*)\" href=\"([^\"]*)\">(.*?)</a>",alertList);
        while(alert.find()) {
            String href=Html.fromHtml(alert.group(2),Html.FROM_HTML_MODE_LEGACY).toString();
            if(!(href.equals("/app/tasks.php")||href.startsWith("/app/tasks.php?"))||href.contains("\\")||href.contains(":")||href.contains(".."))continue;
            alerts.put(new JSONObject().put("style",alert.group(1)).put("href",href)
                .put("title",text(group("<strong>(.*?)</strong>",alert.group(3))))
                .put("hint",text(group("<small>(.*?)</small>",alert.group(3)))));
        }
        result.put("alerts",alerts);
        result.put("allClear",alerts.length()==0&&alertList.contains("home-all-clear"));
        String journal=group("<section class=\"card home-journal-card\">(.*?)</section>",html);
        result.put("journalTitle",text(group("<h2>(.*?)</h2>",journal)));
        String journalText=group("<p class=\"home-journal-text\">(.*?)</p>",journal);
        if(journalText.isEmpty())journalText=group("<p class=\"small\">(.*?)</p>",journal);
        result.put("journalText",text(journalText));
        String journalHref=Html.fromHtml(group("href=\"([^\"]*)\"",journal),Html.FROM_HTML_MODE_LEGACY).toString();
        if(!(journalHref.equals("/app/family_journal.php")||journalHref.startsWith("/app/family_journal.php?"))||journalHref.contains(":")||journalHref.contains("\\")||journalHref.contains(".."))journalHref="/app/family_journal.php";
        result.put("journalHref",journalHref);
        String chips=group("<div class=\"home-journal-stats\">(.*?)</div>",journal);
        JSONArray journalStats=new JSONArray();Matcher chip=match("<span>(.*?)</span>",chips);
        while(chip.find())journalStats.put(text(chip.group(1)));result.put("journalStats",journalStats);
        String fortune=group("<details class=\"card home-fortune\">(.*?)</details>",html);
        result.put("fortuneTitle",text(group("<summary>(.*?)</summary>",fortune)));
        JSONArray paragraphs=new JSONArray();Matcher paragraph=match("<p[^>]*>(.*?)</p>",fortune);
        while(paragraph.find())paragraphs.put(text(paragraph.group(1)));result.put("fortune",paragraphs);
        if(result.optString("title").isEmpty()||journal.isEmpty()||fortune.isEmpty())throw new IllegalStateException("Home dashboard contract changed");
        return result;
    }
}
