package jp.marinski.familytodo;

import android.app.*;
import android.content.*;
import android.net.*;
import android.speech.tts.*;
import android.widget.*;
import androidx.mediarouter.media.MediaRouter;
import com.google.android.gms.cast.*;
import com.google.android.gms.cast.framework.*;
import java.io.File;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

/** User-initiated local Cast audio only. Does not claim delivery from a load acknowledgement. */
final class GoogleHomeSpeaker implements AutoCloseable {
    private final Activity activity;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private AlertDialog dialog;
    private TextView status;
    private EditText text;
    private LinearLayout devices;
    private CastContext context;
    private MediaRouter router;
    private TextToSpeech tts;
    private SpeechAudioServer server;
    private File audio;
    private volatile boolean closed;
    private boolean ttsReady,busy;
    private final MediaRouter.Callback routes=new MediaRouter.Callback(){
        @Override public void onRouteAdded(MediaRouter r,MediaRouter.RouteInfo route){renderRoutes();}
        @Override public void onRouteChanged(MediaRouter r,MediaRouter.RouteInfo route){renderRoutes();}
        @Override public void onRouteRemoved(MediaRouter r,MediaRouter.RouteInfo route){renderRoutes();}
    };
    private final SessionManagerListener<CastSession> sessions=new SessionManagerListener<CastSession>(){
        public void onSessionStarting(CastSession s){}
        public void onSessionStarted(CastSession s,String id){state("接続しました。読み上げボタンを押してください。");renderRoutes();}
        public void onSessionStartFailed(CastSession s,int error){state("接続できませんでした。同じWi-Fiとスピーカーの状態を確認してください。");}
        public void onSessionEnding(CastSession s){}
        public void onSessionEnded(CastSession s,int error){state("接続が切れました。");busy=false;}
        public void onSessionResuming(CastSession s,String id){}
        public void onSessionResumed(CastSession s,boolean suspended){state("接続しました。");renderRoutes();}
        public void onSessionResumeFailed(CastSession s,int error){state("再接続できませんでした。");}
        public void onSessionSuspended(CastSession s,int reason){state("接続が中断されました。");busy=false;}
    };
    GoogleHomeSpeaker(Activity activity){this.activity=activity;}
    void show(String body) {
        LinearLayout box=new LinearLayout(activity);box.setOrientation(LinearLayout.VERTICAL);int pad=(int)(16*activity.getResources().getDisplayMetrics().density);box.setPadding(pad,pad,pad,pad);
        TextView help=new TextView(activity);help.setText("同じWi-FiのGoogle Homeを選んで読み上げます。再生が終わるまでこの画面を開いてください。スピーカーの再生中の音声が切り替わります。");box.addView(help);
        text=new EditText(activity);text.setText(body);text.setMaxLines(4);text.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(4000)});box.addView(text);
        status=new TextView(activity);status.setText("スピーカーを探しています…");box.addView(status);
        devices=new LinearLayout(activity);devices.setOrientation(LinearLayout.VERTICAL);ScrollView scroll=new ScrollView(activity);scroll.addView(devices);box.addView(scroll,new LinearLayout.LayoutParams(-1,(int)(140*activity.getResources().getDisplayMetrics().density)));
        dialog=new AlertDialog.Builder(activity).setTitle("Google Homeで読み上げ").setView(box).setPositiveButton("今すぐ読み上げる",null).setNeutralButton("予約の設定方法",null).setNegativeButton("閉じる",null).create();
        dialog.setOnDismissListener(d->close());dialog.show();dialog.getButton(-1).setOnClickListener(v->speak());dialog.getButton(-3).setOnClickListener(v->scheduleHelp());
        tts=new TextToSpeech(activity,result->{activity.runOnUiThread(()->{if(closed)return;if(result==TextToSpeech.SUCCESS){int language=tts.setLanguage(Locale.JAPAN);ttsReady=language!=TextToSpeech.LANG_MISSING_DATA&&language!=TextToSpeech.LANG_NOT_SUPPORTED;}if(!ttsReady)state("日本語の音声合成を利用できません。端末の音声合成設定を確認してください。");});});
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
            public void onStart(String id){}
            public void onDone(String id){prepareAudio();}
            public void onError(String id){activity.runOnUiThread(()->{busy=false;state("音声を作成できませんでした。");});}
        });
        // Lazy initialization: no Google services or discovery during ordinary app use/UI fixtures.
        try{CastContext.getSharedInstance(activity,worker).addOnSuccessListener(c->{if(closed)return;context=c;c.getSessionManager().addSessionManagerListener(sessions,CastSession.class);router=MediaRouter.getInstance(activity);router.addCallback(c.getMergedSelector(),routes,MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY);renderRoutes();}).addOnFailureListener(error->state("Google Castを利用できません。Google Play開発者サービスを確認してください。"));}catch(Exception error){state("Google Castを初期化できませんでした。");}
    }
    private void state(String message){if(!closed&&status!=null)status.setText(message);}
    private void renderRoutes() {
        if(closed||router==null)return;devices.removeAllViews();int count=0;
        for(MediaRouter.RouteInfo route:router.getRoutes())if(!route.isDefault()&&route.isEnabled()&&route.matchesSelector(context.getMergedSelector())) {
            Button button=new Button(activity);button.setText(route.getName()+(route.isSelected()?"（接続中）":""));button.setOnClickListener(v->{if(busy)return;state("接続中…");route.select();});devices.addView(button);count++;
        }
        if(count==0)state("スピーカーが見つかりません。同じWi-Fiに接続して、この画面でお待ちください。");
    }
    private void speak() {
        if(closed||busy)return;
        if(!ttsReady){state("日本語の音声合成の準備を待つか、端末の音声合成設定を確認してください。");return;}
        CastSession session=context==null?null:context.getSessionManager().getCurrentCastSession();
        if(session==null||!session.isConnected()){state("先にGoogle Homeを選んで接続してください。");return;}
        String body=text.getText().toString().trim();if(body.isEmpty()){state("読み上げる文字を入力してください。");return;}
        try{if(server!=null){server.close();server=null;}if(audio!=null)audio.delete();audio=File.createTempFile("home-speech-",".wav",activity.getCacheDir());busy=true;state("音声を作成しています…");if(tts.synthesizeToFile(body,new android.os.Bundle(),audio,UUID.randomUUID().toString())==TextToSpeech.ERROR){busy=false;state("音声を作成できませんでした。");}}catch(Exception error){busy=false;state("音声ファイルを作成できませんでした。");}
    }
    private InetAddress wifiAddress()throws Exception {
        ConnectivityManager manager=(ConnectivityManager)activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        for(Network network:manager.getAllNetworks()){NetworkCapabilities capabilities=manager.getNetworkCapabilities(network);LinkProperties links=manager.getLinkProperties(network);if(capabilities!=null&&capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)&&links!=null)for(LinkAddress link:links.getLinkAddresses())if(link.getAddress() instanceof Inet4Address&&!link.getAddress().isLoopbackAddress())return link.getAddress();}
        throw new IllegalStateException("Wi-Fi required");
    }
    private void prepareAudio() {
        if(closed)return;
        try{worker.execute(()->{try{SpeechAudioServer ready=new SpeechAudioServer(wifiAddress(),audio);activity.runOnUiThread(()->{if(closed){ready.close();return;}server=ready;CastSession session=context.getSessionManager().getCurrentCastSession();if(session==null||!session.isConnected()||session.getRemoteMediaClient()==null){busy=false;state("接続が切れました。接続して再試行してください。");return;}MediaMetadata metadata=new MediaMetadata(MediaMetadata.MEDIA_TYPE_GENERIC);metadata.putString(MediaMetadata.KEY_TITLE,"つちだけの伝言");MediaInfo info=new MediaInfo.Builder(ready.url()).setContentType("audio/wav").setStreamType(MediaInfo.STREAM_TYPE_BUFFERED).setMetadata(metadata).build();session.getRemoteMediaClient().load(new MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).build()).setResultCallback(result->{busy=false;state(result.getStatus().isSuccess()?"再生を依頼しました。スピーカーの音声を確認してください。":"再生を依頼できませんでした。接続を確認してください。");});});}catch(Exception error){activity.runOnUiThread(()->{busy=false;state("Wi-Fiの音声配信を開始できませんでした。");});}});}catch(RejectedExecutionException ignored){}
    }
    private void scheduleHelp() {
        new AlertDialog.Builder(activity).setTitle("Google Homeで予約する").setMessage("このアプリから自動で予約はできません。Google Homeアプリの『自動化』で時刻を指定し、『ブロードキャスト』のメッセージを設定してください。下のボタンで本文をコピーしてGoogle Homeを開きます。\n\nこの画面のCast再生は、声の返信を伝言へ取り込む機能には対応していません。").setPositiveButton("本文をコピーして開く",(d,w)->{((ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("読み上げる伝言",text.getText().toString()));Intent home=activity.getPackageManager().getLaunchIntentForPackage("com.google.android.apps.chromecast.app");if(home!=null)activity.startActivity(home);else state("本文をコピーしました。Google Homeアプリを開いてください。");}).setNegativeButton("閉じる",null).show();
    }
    @Override public void close(){if(closed)return;closed=true;if(router!=null)router.removeCallback(routes);if(context!=null)context.getSessionManager().removeSessionManagerListener(sessions,CastSession.class);if(tts!=null){tts.stop();tts.shutdown();}if(server!=null)server.close();if(audio!=null)audio.delete();worker.shutdownNow();if(dialog!=null&&dialog.isShowing())dialog.dismiss();}
}
