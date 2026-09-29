package jp.marinski.familytodo;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/** Resume only a previously enabled location share after unlock or app update. */
public final class LocationBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        String action=intent==null?"":intent.getAction();
        if(!Intent.ACTION_BOOT_COMPLETED.equals(action)&&!Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        if(!Credentials.sharingEnabled(context)||Credentials.read(context)==null) return;
        if(Build.VERSION.SDK_INT>=29 && context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)!=PackageManager.PERMISSION_GRANTED) return;
        if(context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
            context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) return;
        try { context.startForegroundService(new Intent(context,LocationService.class)); }
        catch(RuntimeException ignored) { /* OS restrictions can require a manual restart from the visible app. */ }
    }
}
