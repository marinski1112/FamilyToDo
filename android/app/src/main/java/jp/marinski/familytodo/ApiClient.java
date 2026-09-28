package jp.marinski.familytodo;

import android.webkit.CookieManager;
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
    static JSONObject request(String path, JSONObject body) throws Exception {
        if (!path.startsWith("/api/") || path.startsWith("//")) throw new IllegalArgumentException("Invalid API path");
        HttpURLConnection connection = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        try {
            connection.setConnectTimeout(10_000); connection.setReadTimeout(15_000);
            connection.setRequestProperty("Accept", "application/json");
            String cookies = CookieManager.getInstance().getCookie(ORIGIN);
            if (cookies != null) connection.setRequestProperty("Cookie", cookies);
            if (body != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            String setCookie = connection.getHeaderField("Set-Cookie");
            if (setCookie != null) CookieManager.getInstance().setCookie(ORIGIN, setCookie);
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
