package jp.marinski.familytodo;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Locale;

/** Measurement maxima are chart points; latest values are ordered actual records. */
final class FamilyLogMeasurements {
    static void mergeLatest(JSONObject target,JSONArray rows)throws Exception {
        if(rows==null)return;
        for(int i=0;i<rows.length();i++) {
            JSONObject row=rows.optJSONObject(i);if(row==null||row.isNull("amount"))continue;
            String type=row.optString("log_type");if(!type.equals("TEMPERATURE")&&!type.equals("WEIGHT")&&!type.equals("HEIGHT"))continue;
            JSONObject old=target.optJSONObject(type);
            int order=old==null?1:row.optString("occurred_at").compareTo(old.optString("occurred_at"));
            if(old==null||order>0||order==0&&row.optLong("id")>old.optLong("id"))target.put(type,row);
        }
    }
    static String describeLatest(JSONObject rows) {
        StringBuilder text=new StringBuilder("期間内の最新測定値");
        String[] types={"TEMPERATURE","WEIGHT","HEIGHT"},names={"体温","体重","身長"},units={"℃","kg","cm"};
        for(int i=0;i<types.length;i++) {
            JSONObject row=rows==null?null:rows.optJSONObject(types[i]);
            text.append("\n").append(names[i]).append(": ");
            if(row==null)text.append("記録なし");
            else text.append(String.format(Locale.JAPAN,"%.1f",row.optDouble("amount"))).append(units[i]).append(" ・ ").append(row.optString("occurred_at"));
        }
        return text.toString();
    }
    static ArrayList<JSONObject> points(JSONArray daily,String key,LocalDate start,LocalDate end) {
        ArrayList<JSONObject> points=new ArrayList<>();
        for(int i=0;i<daily.length();i++) {
            JSONObject row=daily.optJSONObject(i);if(row==null||!row.has(key)||row.isNull(key))continue;
            try {LocalDate day=LocalDate.parse(row.optString("day"));if(!day.isBefore(start)&&!day.isAfter(end)&&Double.isFinite(row.optDouble(key)))points.add(row);}catch(Exception ignored){}
        }
        points.sort((a,b)->a.optString("day").compareTo(b.optString("day")));return points;
    }
    static final class Chart extends View {
        final ArrayList<JSONObject> points;final String key;final LocalDate start,end;final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        Chart(Context context,JSONArray daily,String key,LocalDate start,LocalDate end) {
            super(context);this.key=key;this.start=start;this.end=end;points=points(daily,key,start,end);
            StringBuilder description=new StringBuilder(key.equals("temperatureMax")?"体温":key.equals("weightMax")?"体重":"身長");description.append("、日別最大値");
            for(JSONObject row:points)description.append("、").append(row.optString("day")).append(" ").append(row.optDouble(key));
            if(points.isEmpty())description.append("、記録なし");setContentDescription(description.toString());setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);float density=getResources().getDisplayMetrics().density,left=55*density,right=Math.max(left+1,getWidth()-12*density),top=25*density,bottom=getHeight()-36*density;
            boolean dark=(getResources().getConfiguration().uiMode&48)==32;paint.setTextSize(12*density);paint.setColor(dark?0xffe5e7eb:0xff374151);paint.setStrokeWidth(1*density);
            if(points.isEmpty()){canvas.drawText("この期間の測定記録はありません",12*density,top+20*density,paint);return;}
            double min=Double.POSITIVE_INFINITY,max=Double.NEGATIVE_INFINITY;
            for(JSONObject row:points){double v=row.optDouble(key);min=Math.min(min,v);max=Math.max(max,v);}double spread=max-min;if(spread==0)spread=1;
            canvas.drawText(String.format(Locale.JAPAN,"%.1f",max),4*density,top,paint);canvas.drawText(String.format(Locale.JAPAN,"%.1f",min),4*density,bottom,paint);
            canvas.drawLine(left,top,left,bottom,paint);canvas.drawLine(left,bottom,right,bottom,paint);
            canvas.drawText(start.toString().substring(5),left,bottom+22*density,paint);canvas.drawText(end.toString().substring(5),right-40*density,bottom+22*density,paint);
            paint.setColor(dark?0xff5eead4:0xff0d9488);paint.setStrokeWidth(2*density);float px=0,py=0;boolean first=true;
            double days=Math.max(1,java.time.temporal.ChronoUnit.DAYS.between(start,end));
            for(JSONObject row:points){float x=left+(float)(java.time.temporal.ChronoUnit.DAYS.between(start,LocalDate.parse(row.optString("day")))/days)*(right-left),y=bottom-(float)((row.optDouble(key)-min)/spread)*(bottom-top);
                if(!first)canvas.drawLine(px,py,x,y,paint);canvas.drawCircle(x,y,3*density,paint);first=false;px=x;py=y;}
        }
    }
}
