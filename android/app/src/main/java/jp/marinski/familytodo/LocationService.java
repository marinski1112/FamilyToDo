package jp.marinski.familytodo;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.IBinder;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Explicitly started foreground location sharing; no silent boot restart. */
public final class LocationService extends Service implements LocationListener {
    private static final String ENDPOINT = "https://familytodo.marinski1112.workers.dev/api/location/android";
    private final ExecutorService sender = Executors.newSingleThreadExecutor();
    private LocationManager manager;
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (Credentials.read(this) == null) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel("location", "位置共有", NotificationManager.IMPORTANCE_LOW));
        Notification notification = new Notification.Builder(this, "location").setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("FamilyToDo 位置共有中").setContentText("アプリの位置設定から停止できます")
            .setOngoing(true).build();
        startForeground(1, notification);
        manager = getSystemService(LocationManager.class);
        try {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED && manager.isProviderEnabled(LocationManager.GPS_PROVIDER))
                manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 60_000, 50, this);
            if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED && manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 60_000, 50, this);
        } catch (SecurityException ignored) { stopSelf(); }
        return START_NOT_STICKY;
    }
    @Override public void onLocationChanged(Location location) {
        if (!location.hasAccuracy() || location.getAccuracy() < 0 || location.getAccuracy() > 10_000) return;
        if (location.getTime() <= 0 || System.currentTimeMillis() - location.getTime() > 24 * 60 * 60_000L) return;
        sender.execute(() -> send(location));
    }
    private void send(Location location) {
        String credential = Credentials.read(this);
        if (credential == null) return;
        HttpURLConnection connection = null;
        try {
            JSONObject point = new JSONObject().put("latitude", location.getLatitude()).put("longitude", location.getLongitude())
                .put("accuracyMeters", (double) location.getAccuracy()).put("recordedAt", DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC).format(Instant.ofEpochMilli(location.getTime())));
            byte[] bytes = point.toString().getBytes(StandardCharsets.UTF_8);
            connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
            connection.setRequestMethod("POST"); connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + credential);
            connection.setConnectTimeout(10_000); connection.setReadTimeout(10_000); connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            int code = connection.getResponseCode();
            if (code == 401) stopSelf();
        } catch (Exception ignored) { /* A later sensor update retries; never log coordinates or credentials. */ }
        finally { if (connection != null) connection.disconnect(); }
    }
    @Override public void onDestroy() {
        if (manager != null) manager.removeUpdates(this);
        sender.shutdownNow(); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
