package jp.marinski.familytodo;

import androidx.activity.ComponentActivity;
import java.util.function.BooleanSupplier;

/** Optional Home SDK boundary. Ordinary builds retain Cast and never advertise remote speech. */
public abstract class HomeRemote implements AutoCloseable {
    public interface Result { void complete(String state, String detail); }
    public abstract boolean available();
    public abstract boolean configured(String owner);
    public abstract String targetLabel(String owner);
    public abstract void setup(String owner, BooleanSupplier current, Runnable onConfigured);
    public abstract void broadcast(String owner, int messageId, String text, BooleanSupplier current, Result result);
    public abstract void resetSession();
    public abstract void close();

    public static HomeRemote create(ComponentActivity activity) {
        if (!BuildConfig.UI_TEST_MODE && BuildConfig.HOME_REMOTE_SDK && android.os.Build.VERSION.SDK_INT >= 29) {
            try {
                return (HomeRemote)Class.forName("jp.marinski.familytodo.HomeRemoteSdk")
                    .getConstructor(ComponentActivity.class).newInstance(activity);
            } catch (ReflectiveOperationException | LinkageError ignored) { /* Fail closed. */ }
        }
        return new HomeRemote() {
            public boolean available(){return false;}
            public boolean configured(String owner){return false;}
            public String targetLabel(String owner){return "未設定";}
            public void setup(String owner, BooleanSupplier current, Runnable onConfigured){
                new android.app.AlertDialog.Builder(activity).setTitle("外出先からの読み上げ")
                    .setMessage("このAPKにはGoogle Home SDKが含まれていません。対応版とGoogle認証設定が必要です。同じWi-Fiでの読み上げは利用できます。")
                    .setPositiveButton("閉じる",null).show();
            }
            public void broadcast(String owner,int id,String text,BooleanSupplier current,Result result){result.complete("SAFE_FAILED","Google Homeの設定が必要です");}
            public void resetSession(){}
            public void close(){}
        };
    }
}
