package jp.marinski.familytodo;

import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;

/** Classifies a stationary press on release; scrolling cancels every action. */
final class CalendarPressListener implements View.OnTouchListener {
    static final long PREVIEW_MS=300, MENU_MS=900;
    private final View target;
    private final Runnable preview;
    private float x,y;
    private boolean active,menu;
    private final Runnable held;
    CalendarPressListener(View target,Runnable preview) {
        this.target=target;this.preview=preview;
        held=()->{if(active&&target.isAttachedToWindow()){menu=true;target.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);target.performLongClick();}};
        target.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener(){
            public void onViewAttachedToWindow(View v){}
            public void onViewDetachedFromWindow(View v){cancel();}
        });
    }
    private void cancel(){active=false;target.removeCallbacks(held);}
    @Override public boolean onTouch(View view,MotionEvent e) {
        switch(e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                x=e.getX();y=e.getY();active=true;menu=false;target.setPressed(true);target.postDelayed(held,MENU_MS);return true;
            case MotionEvent.ACTION_MOVE:
                int slop=ViewConfiguration.get(view.getContext()).getScaledTouchSlop();
                if(e.getPointerCount()>1||Math.hypot(e.getX()-x,e.getY()-y)>slop){cancel();target.setPressed(false);}return true;
            case MotionEvent.ACTION_POINTER_DOWN:case MotionEvent.ACTION_CANCEL:
                cancel();target.setPressed(false);return true;
            case MotionEvent.ACTION_UP:
                boolean valid=active;cancel();target.setPressed(false);
                if(valid&&!menu){long duration=e.getEventTime()-e.getDownTime();if(duration>=MENU_MS)target.performLongClick();else if(duration>=PREVIEW_MS)preview.run();else target.performClick();}return true;
            default:return true;
        }
    }
}
