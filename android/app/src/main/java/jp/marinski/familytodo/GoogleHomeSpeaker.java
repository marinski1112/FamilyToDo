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
    private boolean ttsReady;
    private final android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());
    private final SpeechRequestGate requests=new SpeechRequestGate();
    private Runnable timeout;
    private CastSession audioSession;
    private String audioUrl;
    private AlertDialog reservationHelp;
    private final MediaRouter.Callback routes=new MediaRouter.Callback(){
        @Override public void onRouteAdded(MediaRouter r,MediaRouter.RouteInfo route){renderRoutes();}
        @Override public void onRouteChanged(MediaRouter r,MediaRouter.RouteInfo route){renderRoutes();}
        @Override public void onRouteRemoved(MediaRouter r,MediaRouter.RouteInfo route){renderRoutes();}
    };
    private final SessionManagerListener<CastSession> sessions=new SessionManagerListener<CastSession>(){
        public void onSessionStarting(CastSession s){cancelSpeech();}
        public void onSessionStarted(CastSession s,String id){state("接続しました。読み上げボタンを押してください。");renderRoutes();}
        public void onSessionStartFailed(CastSession s,int error){state("接続できませんでした。同じWi-Fiとスピーカーの状態を確認してください。");}
        public void onSessionEnding(CastSession s){cancelSpeech();}
        public void onSessionEnded(CastSession s,int error){cancelSpeech();state("接続が切れました。");}
        public void onSessionResuming(CastSession s,String id){}
        public void onSessionResumed(CastSession s,boolean suspended){state("接続しました。");renderRoutes();}
        public void onSessionResumeFailed(CastSession s,int error){cancelSpeech();state("再接続できませんでした。");}
        public void onSessionSuspended(CastSession s,int reason){cancelSpeech();state("接続が中断されました。");}
    };
    GoogleHomeSpeaker(Activity activity){this.activity=activity;}
    void show(String body) {
        LinearLayout box=new LinearLayout(activity);box.setOrientation(LinearLayout.VERTICAL);int pad=(int)(16*activity.getResources().getDisplayMetrics().density);box.setPadding(pad,pad,pad,pad);
        TextView help=new TextView(activity);help.setText("同じWi-FiのGoogle Homeを選んで読み上げます。再生が終わるまでこの画面を開いてください。スピーカーの再生中の音声が切り替わります。");box.addView(help);
        text=new EditText(activity);text.setText(body);text.setMaxLines(4);box.addView(text);
        status=new TextView(activity);status.setText("スピーカーを探しています…");box.addView(status);
        devices=new LinearLayout(activity);devices.setOrientation(LinearLayout.VERTICAL);ScrollView scroll=new ScrollView(activity);scroll.addView(devices);box.addView(scroll,new LinearLayout.LayoutParams(-1,(int)(140*activity.getResources().getDisplayMetrics().density)));
        dialog=new AlertDialog.Builder(activity).setTitle("Google Homeで読み上げ").setView(box).setPositiveButton("今すぐ読み上げる",null).setNeutralButton("予約の設定方法",null).setNegativeButton("停止して閉じる",null).create();
        dialog.setOnDismissListener(d->close());dialog.show();dialog.getButton(-1).setOnClickListener(v->speak());dialog.getButton(-3).setOnClickListener(v->scheduleHelp());
        try {
            // Always enqueue init: some engines can invoke the callback before the constructor returns.
            tts=new TextToSpeech(activity,result->handler.post(()->{
                if(closed)return;
                try{ttsReady=result==TextToSpeech.SUCCESS&&tts!=null&&tts.setLanguage(Locale.JAPAN)>=TextToSpeech.LANG_AVAILABLE;}catch(RuntimeException error){ttsReady=false;}
                if(!ttsReady)state("日本語の音声合成を利用できません。端末の音声合成設定を確認してください。");
            }));
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                public void onStart(String id){}
                public void onDone(String id){handler.post(()->prepareAudio(id));}
                public void onError(String id){handler.post(()->fail(id,"音声を作成できませんでした。再試行できます。"));}
                public void onStop(String id,boolean interrupted){handler.post(()->fail(id,"音声の作成が中断されました。再試行できます。"));}
            });
        }catch(RuntimeException error){state("音声合成を開始できません。端末の音声合成設定を確認してください。");}
        // Lazy initialization: no Google services or discovery during ordinary app use/UI fixtures.
        try{CastContext.getSharedInstance(activity,worker).addOnSuccessListener(c->{if(closed)return;context=c;c.getSessionManager().addSessionManagerListener(sessions,CastSession.class);router=MediaRouter.getInstance(activity);router.addCallback(c.getMergedSelector(),routes,MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY);renderRoutes();}).addOnFailureListener(error->state("Google Castを利用できません。Google Play開発者サービスを確認してください。"));}catch(Exception error){state("Google Castを初期化できませんでした。");}
    }
    private void state(String message){if(!closed&&status!=null)status.setText(message);}
    private void renderRoutes() {
        if(closed||router==null)return;devices.removeAllViews();int count=0;
        for(MediaRouter.RouteInfo route:router.getRoutes())if(!route.isDefault()&&route.isEnabled()&&route.matchesSelector(context.getMergedSelector())) {
            Button button=new Button(activity);button.setText(route.getName()+(route.isSelected()?"（接続中）":""));button.setOnClickListener(v->{if(requests.busy())return;cancelSpeech();state("接続中…");try{route.select();}catch(RuntimeException error){state("接続できませんでした。再試行してください。");}});devices.addView(button);count++;
        }
        if(count==0)state("スピーカーが見つかりません。同じWi-Fiに接続して、この画面でお待ちください。");
    }
    private CastSession currentSession(){return context==null?null:context.getSessionManager().getCurrentCastSession();}
    private void speak() {
        if(closed||requests.busy())return;
        if(!ttsReady){state("日本語の音声合成の準備を待つか、端末の音声合成設定を確認してください。");return;}
        CastSession session=currentSession();
        if(session==null||!session.isConnected()){state("先にGoogle Homeを選んで接続してください。");return;}
        String body=text.getText().toString().trim();
        if(body.isEmpty()){state("読み上げる文字を入力してください。");return;}
        if(body.length()>TextToSpeech.getMaxSpeechInputLength()){state("本文が長すぎます。"+TextToSpeech.getMaxSpeechInputLength()+"文字以内に分けてください。");return;}
        cancelSpeech();String id=requests.begin(session);if(id==null)return;
        try{
            audio=File.createTempFile("home-speech-",".wav",activity.getCacheDir());
            state("音声を作成しています…");
            timeout=()->fail(id,"音声の準備が時間切れになりました。接続を確認して再試行してください。");handler.postDelayed(timeout,90000);
            if(tts.synthesizeToFile(body,new android.os.Bundle(),audio,id)==TextToSpeech.ERROR)fail(id,"音声を作成できませんでした。再試行できます。");
        }catch(Exception error){fail(id,"音声を作成できませんでした。再試行できます。");}
    }
    private void fail(String id,String message){if(!requests.current(id))return;cancelSpeech();state(message);}
    private void clearTimeout(){if(timeout!=null){handler.removeCallbacks(timeout);timeout=null;}}
    private void stopOwnedAudio(CastSession session,String url) {
        if(session==null||url==null)return;
        try{if(session.isConnected()&&session.getRemoteMediaClient()!=null){MediaInfo info=session.getRemoteMediaClient().getMediaInfo();if(info!=null&&url.equals(info.getContentId()))session.getRemoteMediaClient().stop();}}catch(RuntimeException ignored){}
    }
    private void cancelSpeech(){
        requests.cancel();clearTimeout();
        if(tts!=null)try{tts.stop();}catch(RuntimeException ignored){}
        stopOwnedAudio(audioSession,audioUrl);audioSession=null;audioUrl=null;
        if(server!=null){server.close();server=null;}
        if(audio!=null){audio.delete();audio=null;}
    }
    private InetAddress wifiAddress()throws Exception {
        ConnectivityManager manager=(ConnectivityManager)activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        for(Network network:manager.getAllNetworks()){NetworkCapabilities capabilities=manager.getNetworkCapabilities(network);LinkProperties links=manager.getLinkProperties(network);if(capabilities!=null&&capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)&&links!=null)for(LinkAddress link:links.getLinkAddresses())if(link.getAddress() instanceof Inet4Address&&!link.getAddress().isLoopbackAddress())return link.getAddress();}
        throw new IllegalStateException("Wi-Fi required");
    }
    private void prepareAudio(String id) {
        if(!requests.prepare(id))return;
        final File file=audio;
        if(file==null){fail(id,"音声ファイルを取得できませんでした。");return;}
        try{worker.execute(()->{
            try {
                SpeechAudioServer ready=new SpeechAudioServer(wifiAddress(),file);
                handler.post(()->{
                    if(!requests.current(id)){ready.close();return;}
                    CastSession session=currentSession();
                    if(session==null||!session.isConnected()||session.getRemoteMediaClient()==null||!requests.load(id,session)){
                        ready.close();fail(id,"接続が変わりました。接続先を確認して再試行してください。");return;
                    }
                    server=ready;audioSession=session;audioUrl=ready.url();final String url=audioUrl;
                    try {
                        MediaMetadata metadata=new MediaMetadata(MediaMetadata.MEDIA_TYPE_GENERIC);metadata.putString(MediaMetadata.KEY_TITLE,"つちだけの伝言");
                        MediaInfo info=new MediaInfo.Builder(url).setContentType("audio/wav").setStreamType(MediaInfo.STREAM_TYPE_BUFFERED).setMetadata(metadata).build();
                        session.getRemoteMediaClient().load(new MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).build()).setResultCallback(result->{
                            if(!requests.current(id)){stopOwnedAudio(session,url);return;}
                            if(result.getStatus().isSuccess()&&requests.accepted(id)){clearTimeout();state("再生を依頼しました。スピーカーの音声を確認してください。");}
                            else fail(id,"再生を依頼できませんでした。接続を確認して再試行してください。");
                        });
                    }catch(RuntimeException error){fail(id,"再生を依頼できませんでした。再試行してください。");}
                });
            }catch(Exception error){handler.post(()->fail(id,"音声を配信できませんでした。Wi-Fi接続を確認して再試行してください。"));}
            finally{file.delete();}
        });}catch(RejectedExecutionException error){fail(id,"音声の処理が中断されました。");}
    }
    private void scheduleHelp() {
        reservationHelp=new AlertDialog.Builder(activity).setTitle("Google Homeで予約する").setMessage("このアプリから自動で予約はできません。Google Homeアプリの『自動化』で時刻を指定し、『ブロードキャスト』のメッセージを設定してください。下のボタンで本文をコピーしてGoogle Homeを開きます。\n\nこの画面のCast再生は、声の返信を伝言へ取り込む機能には対応していません。").setPositiveButton("本文をコピーして開く",(d,w)->{((ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("読み上げる伝言",text.getText().toString()));Intent home=activity.getPackageManager().getLaunchIntentForPackage("com.google.android.apps.chromecast.app");if(home!=null){try{activity.startActivity(home);}catch(ActivityNotFoundException error){state("本文をコピーしました。Google Homeアプリを開いてください。");}}else state("本文をコピーしました。Google Homeアプリを開いてください。");}).setNegativeButton("閉じる",null).show();
    }
    @Override public void close(){
        if(closed)return;closed=true;cancelSpeech();requests.close();
        if(router!=null)router.removeCallback(routes);
        if(context!=null)context.getSessionManager().removeSessionManagerListener(sessions,CastSession.class);
        if(tts!=null)try{tts.shutdown();}catch(RuntimeException ignored){}
        worker.shutdownNow();
        if(reservationHelp!=null&&reservationHelp.isShowing())reservationHelp.dismiss();
        if(dialog!=null&&dialog.isShowing())dialog.dismiss();
    }
}
