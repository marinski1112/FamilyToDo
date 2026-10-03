package jp.marinski.familytodo;

import android.webkit.CookieManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import org.json.JSONObject;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Reuses the signed HttpOnly web session without exposing it to page JavaScript. */
final class ApiClient {
    static final String ORIGIN = BuildConfig.API_ORIGIN;
    private static volatile boolean mutationsEnabled;
    interface FixtureTransport { JSONObject request(String path,JSONObject body,String method) throws Exception; }
    static volatile FixtureTransport fixtureTransport;
    private ApiClient() {}
    private static void forbidFixtureNetwork() {
        if(BuildConfig.UI_TEST_MODE)throw new IllegalStateException("UI fixture network is disabled");
    }
    static void setMutationsEnabled(boolean enabled) { mutationsEnabled=enabled && BuildConfig.ALLOW_MUTATIONS; }
    static boolean canMutate() { return mutationsEnabled; }
    static void requireMutationReady() {
        if(!mutationsEnabled) throw new IllegalStateException("保存済みデータの表示中は編集できません");
    }
    /** Fetch a bounded same-origin thumbnail, including private upload media. */
    static Bitmap thumbnail(String path) throws Exception {
        if(BuildConfig.UI_TEST_MODE) {
            Bitmap fixture=Bitmap.createBitmap(100,100,Bitmap.Config.ARGB_8888);fixture.eraseColor(android.graphics.Color.parseColor("#6366F1"));return fixture;
        }
        boolean messagePhoto=path.matches("/api/messages\\?photo=[1-9][0-9]*");
        boolean stickerPhoto=path.matches("/api/calendar-sticker-media\\?asset=[1-9][0-9]*");
        boolean familyLogPhoto=path.matches("/api/family-log-media\\?media=[1-9][0-9]*");
        if (!path.startsWith("/") || path.startsWith("//") || path.contains("\\") ||
            path.contains("..") || path.contains("#") || path.contains(":") ||
            !(messagePhoto || familyLogPhoto || stickerPhoto || path.startsWith("/api/calendar-stamp-media?") ||
              (!path.contains("?") && (path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".gif")))))
            throw new IllegalArgumentException("Invalid image path");
        forbidFixtureNetwork();
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+path).openConnection();
        try {
            connection.setConnectTimeout(10_000); connection.setReadTimeout(15_000);
            connection.setInstanceFollowRedirects(false);
            String cookies=CookieManager.getInstance().getCookie(ORIGIN);
            if(cookies!=null) connection.setRequestProperty("Cookie",cookies);
            String type=connection.getContentType();
            if(connection.getResponseCode()!=200 || type==null || !type.startsWith("image/"))
                throw new IllegalStateException("Image unavailable");
            try(var stream=connection.getInputStream()) {
                ByteArrayOutputStream data=new ByteArrayOutputStream();
                byte[] buffer=new byte[4096]; int count;
                while((count=stream.read(buffer))!=-1) {
                    data.write(buffer,0,count);
                    if(data.size()>(messagePhoto||familyLogPhoto||stickerPhoto?4*1024*1024:1_000_000)) throw new IllegalStateException("Image too large");
                }
                BitmapFactory.Options options=new BitmapFactory.Options();
                options.inJustDecodeBounds=true;
                byte[] bytes=data.toByteArray();
                BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
                if(options.outWidth<=0 || options.outHeight<=0 || options.outWidth>16000 || options.outHeight>16000)
                    throw new IllegalStateException("Invalid image dimensions");
                options.inJustDecodeBounds=false; options.inSampleSize=messagePhoto||familyLogPhoto||"/app-icon-192.png".equals(path)?1:2;
                while(options.outWidth/options.inSampleSize>1024 || options.outHeight/options.inSampleSize>1024)
                    options.inSampleSize*=2;
                Bitmap image=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
                if(image==null || image.getWidth()>1024 || image.getHeight()>1024) throw new IllegalStateException("Invalid thumbnail");
                return image;
            }
        } finally { connection.disconnect(); }
    }
    static byte[] animatedStampBytes(String path) throws Exception {
        forbidFixtureNetwork();
        if(android.os.Build.VERSION.SDK_INT<28) throw new IllegalStateException("Animation unsupported");
        if(!(path.matches("/api/calendar-stamp-media\\?asset=[1-9][0-9]*&variant=full") ||
            path.startsWith("/") && !path.startsWith("//") && !path.contains("?") &&
            !path.contains("..") && !path.contains("\\") && !path.contains(":") &&
            (path.endsWith(".gif")||path.endsWith(".webp")))) throw new IllegalArgumentException("Invalid animation path");
        forbidFixtureNetwork();
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+path).openConnection();
        try {
            connection.setConnectTimeout(10000);connection.setReadTimeout(15000);connection.setInstanceFollowRedirects(false);
            String cookies=CookieManager.getInstance().getCookie(ORIGIN);if(cookies!=null) connection.setRequestProperty("Cookie",cookies);
            int status=connection.getResponseCode();String mime=connection.getContentType();
            if(status!=200 || mime==null || !(mime.startsWith("image/gif")||mime.startsWith("image/webp")))
                throw new IllegalStateException("Animation unavailable");
            try(var stream=connection.getInputStream()) {
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
                while((n=stream.read(buffer))!=-1) { bytes.write(buffer,0,n);if(bytes.size()>4*1024*1024) throw new IllegalStateException("Animation too large"); }
                return bytes.toByteArray();
            }
        } finally { connection.disconnect(); }
    }
    static Bitmap avatar(String raw) throws Exception {
        if(BuildConfig.UI_TEST_MODE)return thumbnail("/fixture.png");
        android.net.Uri uri=android.net.Uri.parse(raw);String host=uri.getHost();
        if(!"https".equals(uri.getScheme())||host==null||
            !(host.equals("profile.line-scdn.net")||host.equals("obs.line-scdn.net"))||
            uri.getPort()!=-1||uri.getUserInfo()!=null)throw new IllegalArgumentException("Invalid LINE avatar");
        forbidFixtureNetwork();
        HttpURLConnection connection=(HttpURLConnection)new URL(raw).openConnection();
        try {
            connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);
            if(connection.getResponseCode()!=200||connection.getContentType()==null||!connection.getContentType().startsWith("image/"))throw new IllegalStateException("Avatar unavailable");
            try(var stream=connection.getInputStream()) {
                ByteArrayOutputStream data=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
                while((n=stream.read(buffer))!=-1){data.write(buffer,0,n);if(data.size()>1000000)throw new IllegalStateException("Avatar too large");}
                byte[] bytes=data.toByteArray();BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
                BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
                if(options.outWidth<=0||options.outHeight<=0||options.outWidth>4096||options.outHeight>4096)throw new IllegalStateException("Avatar dimensions");
                options.inJustDecodeBounds=false;options.inSampleSize=1;
                while(options.outWidth/options.inSampleSize>128||options.outHeight/options.inSampleSize>128)options.inSampleSize*=2;
                Bitmap avatar=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);if(avatar==null)throw new IllegalStateException("Avatar decode");return avatar;
            }
        }finally{connection.disconnect();}
    }
    static android.graphics.drawable.Drawable decodeAnimatedStamp(byte[] bytes) throws Exception {
        if(android.os.Build.VERSION.SDK_INT<28||bytes.length==0||bytes.length>4*1024*1024)
            throw new IllegalArgumentException("Invalid animation");
        android.graphics.ImageDecoder.Source source=android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(bytes));
        return android.graphics.ImageDecoder.decodeDrawable(source,(decoder,info,src) -> {
            int width=info.getSize().getWidth(),height=info.getSize().getHeight();
            if(width<=0||height<=0||width>4096||height>4096) throw new IllegalArgumentException("Invalid dimensions");
            int sample=Math.max(1,(int)Math.ceil(Math.max(width,height)/512.0));
            decoder.setTargetSampleSize(sample);
        });
    }
    /** Fetch only the existing home page, with bounded HTML and no redirect/script execution. */
    static JSONObject homeDashboard() throws Exception {
        if(BuildConfig.UI_TEST_MODE) {
            if(fixtureTransport==null)throw new IllegalStateException("No fixture transport");
            return HomeDashboardParser.parse(fixtureTransport.request("/app/index.php",null,"GET").optString("html"));
        }
        forbidFixtureNetwork();
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/app/index.php").openConnection();
        try {
            connection.setConnectTimeout(10000);connection.setReadTimeout(15000);connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept","text/html");connection.setRequestProperty("Cache-Control","no-cache");
            String cookie=CookieManager.getInstance().getCookie(ORIGIN);if(cookie!=null)connection.setRequestProperty("Cookie",cookie);
            int status=connection.getResponseCode();
            if(status==401||status==302||status==303)throw new SecurityException("ログインしてください");
            String type=connection.getContentType();
            if(status!=200||type==null||!type.startsWith("text/html"))throw new IllegalStateException("Home unavailable");
            String setCookie=connection.getHeaderField("Set-Cookie");if(setCookie!=null){CookieManager.getInstance().setCookie(ORIGIN,setCookie);CookieManager.getInstance().flush();}
            try(var stream=connection.getInputStream()) {
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
                while((n=stream.read(buffer))!=-1){bytes.write(buffer,0,n);if(bytes.size()>512000)throw new IllegalStateException("Home too large");}
                return HomeDashboardParser.parse(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
            }
        }finally{connection.disconnect();}
    }
    static JSONObject request(String path, JSONObject body) throws Exception {
        return request(path,body,body==null?"GET":"POST");
    }
    /** The authenticated PWA manifest supplies this family's home screen label. */
    static JSONObject pwaManifest() throws Exception {
        forbidFixtureNetwork();
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/manifest.webmanifest").openConnection();
        try {
            connection.setConnectTimeout(10_000);connection.setReadTimeout(15_000);
            connection.setInstanceFollowRedirects(false);
            String cookies=CookieManager.getInstance().getCookie(ORIGIN);
            if(cookies!=null) connection.setRequestProperty("Cookie",cookies);
            if(connection.getResponseCode()!=200) throw new IllegalStateException("Manifest unavailable");
            try(var stream=connection.getInputStream()) {
                ByteArrayOutputStream data=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;
                while((count=stream.read(buffer))!=-1) {
                    data.write(buffer,0,count);
                    if(data.size()>65536) throw new IllegalStateException("Manifest too large");
                }
                return new JSONObject(data.toString("UTF-8"));
            }
        } finally { connection.disconnect(); }
    }
    static JSONObject uploadFamilyLogPhoto(int logId,byte[] jpeg,String csrf) throws Exception {
        requireMutationReady();
        if(logId<=0||jpeg.length==0||jpeg.length>4*1024*1024) throw new IllegalArgumentException("Invalid photo");
        forbidFixtureNetwork();
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/api/family-log-media").openConnection();
        try {
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(false); connection.setRequestMethod("POST"); connection.setDoOutput(true);
            connection.setRequestProperty("Accept","application/json"); connection.setRequestProperty("Content-Type","image/jpeg");
            connection.setRequestProperty("x-csrf-token",csrf); connection.setRequestProperty("x-family-log-id",String.valueOf(logId));
            String cookies=CookieManager.getInstance().getCookie(ORIGIN);
            if(cookies!=null) connection.setRequestProperty("Cookie",cookies);
            try(OutputStream output=connection.getOutputStream()) { output.write(jpeg); }
            int status=connection.getResponseCode();
            if(status==401) throw new SecurityException("ログインしてください");
            try(var stream=status<400?connection.getInputStream():connection.getErrorStream()) {
                if(stream==null) throw new IllegalStateException("応答がありません");
                ByteArrayOutputStream data=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
                while((n=stream.read(buffer))!=-1) { data.write(buffer,0,n); if(data.size()>65536) throw new IllegalStateException("応答が大きすぎます"); }
                JSONObject result=new JSONObject(data.toString("UTF-8"));
                if(status==409 && "PHOTO_ALREADY_EXISTS".equals(result.optString("error")))
                    return request("/api/family-log-media?log="+logId,null);
                if(status>=400||!result.optBoolean("ok")) throw new IllegalStateException(result.optString("error","写真を保存できませんでした"));
                return result;
            }
        } finally { connection.disconnect(); }
    }
    static JSONObject deleteFamilyLogPhoto(int mediaId,String csrf) throws Exception {
        requireMutationReady();
        if(mediaId<=0) throw new IllegalArgumentException("Invalid photo");
        forbidFixtureNetwork();
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/api/family-log-media?media="+mediaId).openConnection();
        try {
            connection.setConnectTimeout(10000); connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false); connection.setRequestMethod("DELETE");
            connection.setRequestProperty("Accept","application/json"); connection.setRequestProperty("x-csrf-token",csrf);
            String cookies=CookieManager.getInstance().getCookie(ORIGIN);
            if(cookies!=null) connection.setRequestProperty("Cookie",cookies);
            int status=connection.getResponseCode(); if(status==401) throw new SecurityException("ログインしてください");
            try(var stream=status<400?connection.getInputStream():connection.getErrorStream()) {
                if(stream==null) throw new IllegalStateException("応答がありません");
                ByteArrayOutputStream data=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
                while((n=stream.read(buffer))!=-1) { data.write(buffer,0,n); if(data.size()>65536) throw new IllegalStateException("応答が大きすぎます"); }
                JSONObject result=new JSONObject(data.toString("UTF-8"));
                if(status>=400||!result.optBoolean("ok")) throw new IllegalStateException(result.optString("error","写真を削除できませんでした"));
                return result;
            }
        } finally { connection.disconnect(); }
    }
    static JSONObject uploadStaticStamp(MessagePhotoUpload.PngDraft image,String name,String csrf) throws Exception {
        return uploadStampPng(image.png,name,image.width,image.height,csrf);
    }
    static JSONObject uploadStampFrame(byte[] png,String csrf) throws Exception {
        return uploadStampPng(png,null,0,0,csrf);
    }
    private static JSONObject uploadStampPng(byte[] png,String name,int width,int height,String csrf) throws Exception {
        requireMutationReady();
        if(png==null||png.length==0||png.length>4*1024*1024) throw new IllegalArgumentException("Invalid stamp");
        forbidFixtureNetwork();
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/api/calendar-stamp-admin/upload").openConnection();
        try {
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(false);connection.setRequestMethod("POST");connection.setDoOutput(true);
            connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("Content-Type","image/png");
            connection.setRequestProperty("x-csrf-token",csrf);
            if(name!=null) {
                connection.setRequestProperty("x-stamp-name-b64",android.util.Base64.encodeToString(name.getBytes(StandardCharsets.UTF_8),android.util.Base64.NO_WRAP));
                connection.setRequestProperty("x-stamp-width",String.valueOf(width));
                connection.setRequestProperty("x-stamp-height",String.valueOf(height));
            }
            String cookies=CookieManager.getInstance().getCookie(ORIGIN);if(cookies!=null) connection.setRequestProperty("Cookie",cookies);
            try(OutputStream output=connection.getOutputStream()) { output.write(png); }
            int status=connection.getResponseCode();if(status==401) throw new SecurityException("ログインしてください");
            try(var stream=status<400?connection.getInputStream():connection.getErrorStream()) {
                if(stream==null) throw new IllegalStateException("応答がありません");
                ByteArrayOutputStream data=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
                while((n=stream.read(buffer))!=-1) { data.write(buffer,0,n); if(data.size()>65536) throw new IllegalStateException("応答が大きすぎます"); }
                JSONObject result=new JSONObject(data.toString("UTF-8"));
                if(status>=400||!result.optBoolean("ok")||(name!=null&&result.optInt("assetId")<=0)||
                    (name==null&&!result.optString("storageKey").startsWith("uploads/")))
                    throw new IllegalStateException(result.optString("error","スタンプを登録できませんでした"));
                return result;
            }
        } finally { connection.disconnect(); }
    }
    static JSONObject deleteTask(int id,String csrf) throws Exception {
        requireMutationReady();
        if(id<=0) throw new IllegalArgumentException("Invalid task");
        forbidFixtureNetwork();
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/api/task?id="+id).openConnection();
        try {
            connection.setConnectTimeout(10000);connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false);connection.setRequestMethod("DELETE");
            connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("x-csrf",csrf);
            String cookies=CookieManager.getInstance().getCookie(ORIGIN);if(cookies!=null) connection.setRequestProperty("Cookie",cookies);
            int status=connection.getResponseCode();if(status==401) throw new SecurityException("ログインしてください");
            try(var stream=status<400?connection.getInputStream():connection.getErrorStream()) {
                if(stream==null) throw new IllegalStateException("応答がありません");
                ByteArrayOutputStream data=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
                while((n=stream.read(buffer))!=-1) { data.write(buffer,0,n); if(data.size()>65536) throw new IllegalStateException("応答が大きすぎます"); }
                JSONObject result=new JSONObject(data.toString("UTF-8"));
                if(status>=400||!result.optBoolean("ok")) throw new IllegalStateException(result.optString("error","削除できませんでした"));
                return result;
            }
        } finally { connection.disconnect(); }
    }
    static JSONObject request(String path, JSONObject body, String method) throws Exception {
        if(BuildConfig.UI_TEST_MODE) {
            if(fixtureTransport==null)throw new IllegalStateException("No UI fixture transport");
            if(body!=null)requireMutationReady();
            return fixtureTransport.request(path,body,method);
        }
        if (!path.startsWith("/api/") || path.startsWith("//")) throw new IllegalArgumentException("Invalid API path");
        if (!("GET".equals(method)&&body==null || ("POST".equals(method)||"PUT".equals(method)||"DELETE".equals(method))&&body!=null))
            throw new IllegalArgumentException("Invalid API method");
        if (body != null && !(BuildConfig.ALLOW_MUTATIONS && path.equals("/api/location/devices") &&
            "sharing".equals(body.optString("action")) && !body.optBoolean("enabled")))
            requireMutationReady();
        forbidFixtureNetwork();
        HttpURLConnection connection = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        try {
            connection.setConnectTimeout(10_000); connection.setReadTimeout(15_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/json");
            String cookies = CookieManager.getInstance().getCookie(ORIGIN);
            if (cookies != null) connection.setRequestProperty("Cookie", cookies);
            if (body != null) {
                connection.setRequestMethod(method); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            String setCookie = connection.getHeaderField("Set-Cookie");
            if (setCookie != null) {
                CookieManager.getInstance().setCookie(ORIGIN, setCookie);
                CookieManager.getInstance().flush();
            }
            if (status == 401) throw new SecurityException("ログインしてください");
            if (status >= 300 && status < 400) throw new IllegalStateException("予期しないAPIリダイレクト");
            try (var stream = status < 400 ? connection.getInputStream() : connection.getErrorStream()) {
                if (stream == null) throw new IllegalStateException("応答がありません");
                ByteArrayOutputStream data = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096]; int n;
                while ((n = stream.read(buffer)) != -1) {
                    data.write(buffer, 0, n);
                    if (data.size() > 2_000_000) throw new IllegalStateException("応答が大きすぎます");
                }
                String text = new String(data.toByteArray(), StandardCharsets.UTF_8);
                JSONObject response = new JSONObject(text);
                if (status >= 400 || !response.optBoolean("ok")) throw new IllegalStateException(response.optString("error", "通信に失敗しました"));
                return response;
            }
        } finally { connection.disconnect(); }
    }
}
