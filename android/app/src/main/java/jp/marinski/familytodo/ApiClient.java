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
    static final String ORIGIN = "https://familytodo.marinski1112.workers.dev";
    private ApiClient() {}
    /** Fetch a bounded same-origin thumbnail, including private upload media. */
    static Bitmap thumbnail(String path) throws Exception {
        boolean messagePhoto=path.matches("/api/messages\\?photo=[1-9][0-9]*");
        if (!path.startsWith("/") || path.startsWith("//") || path.contains("\\") ||
            path.contains("..") || path.contains("#") || path.contains(":") ||
            !(messagePhoto || path.startsWith("/api/calendar-stamp-media?") ||
              (!path.contains("?") && (path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".gif")))))
            throw new IllegalArgumentException("Invalid image path");
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
                    if(data.size()>(messagePhoto?4*1024*1024:1_000_000)) throw new IllegalStateException("Image too large");
                }
                BitmapFactory.Options options=new BitmapFactory.Options();
                options.inJustDecodeBounds=true;
                byte[] bytes=data.toByteArray();
                BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
                if(options.outWidth<=0 || options.outHeight<=0 || options.outWidth>16000 || options.outHeight>16000)
                    throw new IllegalStateException("Invalid image dimensions");
                options.inJustDecodeBounds=false; options.inSampleSize=messagePhoto?1:2;
                while(options.outWidth/options.inSampleSize>1024 || options.outHeight/options.inSampleSize>1024)
                    options.inSampleSize*=2;
                Bitmap image=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
                if(image==null || image.getWidth()>1024 || image.getHeight()>1024) throw new IllegalStateException("Invalid thumbnail");
                return image;
            }
        } finally { connection.disconnect(); }
    }
    static JSONObject request(String path, JSONObject body) throws Exception {
        return request(path,body,body==null?"GET":"POST");
    }
    static JSONObject request(String path, JSONObject body, String method) throws Exception {
        if (!path.startsWith("/api/") || path.startsWith("//")) throw new IllegalArgumentException("Invalid API path");
        if (!("GET".equals(method)&&body==null || ("POST".equals(method)||"DELETE".equals(method))&&body!=null))
            throw new IllegalArgumentException("Invalid API method");
        HttpURLConnection connection = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        try {
            connection.setConnectTimeout(10_000); connection.setReadTimeout(15_000);
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
