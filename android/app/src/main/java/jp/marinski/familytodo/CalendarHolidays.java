package jp.marinski.familytodo;

import java.time.LocalDate;

/** Direct port of recurrence-projection.ts holiday labels; same supported rules. */
final class CalendarHolidays {
    private static int monday(int year,int month,int nth) {
        int weekday=LocalDate.of(year,month,1).getDayOfWeek().getValue()%7;
        return 1+(8-weekday)%7+(nth-1)*7;
    }
    private static String base(LocalDate date) {
        int y=date.getYear(),m=date.getMonthValue(),d=date.getDayOfMonth();
        int vernal=(int)Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4.0));
        int autumnal=(int)Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4.0));
        if(m==1&&d==1)return "元日";
        if(m==2&&d==11)return "建国記念の日";
        if(m==2&&d==23)return "天皇誕生日";
        if(m==3&&d==vernal)return "春分の日";
        if(m==4&&d==29)return "昭和の日";
        if(m==5&&d==3)return "憲法記念日";
        if(m==5&&d==4)return "みどりの日";
        if(m==5&&d==5)return "こどもの日";
        if(m==8&&d==11)return "山の日";
        if(m==9&&d==autumnal)return "秋分の日";
        if(m==11&&d==3)return "文化の日";
        if(m==11&&d==23)return "勤労感謝の日";
        if(m==1&&d==monday(y,1,2))return "成人の日";
        if(m==7&&d==monday(y,7,3))return "海の日";
        if(m==9&&d==monday(y,9,3))return "敬老の日";
        if(m==10&&d==monday(y,10,2))return "スポーツの日";
        return null;
    }
    static String name(LocalDate date) {
        String holiday=base(date);if(holiday!=null)return holiday;
        int weekday=date.getDayOfWeek().getValue()%7;
        if(weekday>=1&&weekday<=5&&base(date.minusDays(1))!=null&&base(date.plusDays(1))!=null)return "国民の休日";
        if(weekday>=1&&weekday<=6) {
            LocalDate cursor=date.minusDays(1);
            for(int i=0;i<8;i++) {
                if(cursor.getDayOfWeek().getValue()==7&&base(cursor)!=null)return "振替休日";
                if(base(cursor)==null)break;cursor=cursor.minusDays(1);
            }
        }
        return null;
    }
}
