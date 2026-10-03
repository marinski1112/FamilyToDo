package jp.marinski.familytodo;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;

/** Web checklist's 22dp square, retaining CompoundButton's native state and accessibility. */
final class WebCheckDrawable extends Drawable {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float density;private final boolean dark;private boolean checked,enabled=true;
    WebCheckDrawable(float density,boolean dark){this.density=density;this.dark=dark;}
    @Override public boolean isStateful(){return true;}
    @Override protected boolean onStateChange(int[] states){
        checked=false;enabled=false;for(int state:states){if(state==android.R.attr.state_checked)checked=true;if(state==android.R.attr.state_enabled)enabled=true;}invalidateSelf();return true;
    }
    @Override public int getIntrinsicWidth(){return Math.round(22*density);}
    @Override public int getIntrinsicHeight(){return Math.round(22*density);}
    @Override public void draw(Canvas canvas){
        float stroke=1.8f*density;RectF box=new RectF(getBounds());box.inset(stroke/2,stroke/2);
        paint.setAlpha(enabled?255:110);paint.setStyle(Paint.Style.FILL);paint.setColor(checked?(dark?0xff6366f1:0xff087bff):(dark?0xff1d2b3d:0xffffffff));canvas.drawRoundRect(box,5*density,5*density,paint);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(stroke);paint.setColor(checked?(dark?0xff6366f1:0xff087bff):(dark?0xff718198:0xff9aa1aa));canvas.drawRoundRect(box,5*density,5*density,paint);
        if(checked){Path tick=new Path();tick.moveTo(box.left+box.width()*.22f,box.top+box.height()*.5f);tick.lineTo(box.left+box.width()*.43f,box.top+box.height()*.73f);tick.lineTo(box.left+box.width()*.8f,box.top+box.height()*.27f);paint.setColor(0xffffffff);paint.setStrokeWidth(2*density);canvas.drawPath(tick,paint);}
    }
    @Override public void setAlpha(int alpha){paint.setAlpha(alpha);invalidateSelf();}
    @Override public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);invalidateSelf();}
    @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
}
