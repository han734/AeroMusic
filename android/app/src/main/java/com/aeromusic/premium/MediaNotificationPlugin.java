package com.aeromusic.premium;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.PowerManager;
import android.os.StatFs;
import android.provider.Settings;
import android.net.Uri;
import android.os.Environment;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaNotification")
public class MediaNotificationPlugin extends Plugin {

    private BroadcastReceiver receiver;

    @Override
    public void load() {
        // Listen for broadcasts from MediaNotificationService button clicks and playback progress
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String action = intent.getStringExtra("action");
                if (action != null) {
                    JSObject data = new JSObject();
                    data.put("action", action);
                    
                    if ("timeUpdate".equals(action)) {
                        data.put("currentTime", intent.getDoubleExtra("currentTime", 0.0));
                        data.put("duration", intent.getDoubleExtra("duration", 0.0));
                        notifyListeners("timeUpdate", data);
                    } else {
                        notifyListeners("mediaAction", data);
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter(MediaNotificationService.BROADCAST_ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
    }

    /** Called from JS with { title, artist, album, artwork, isPlaying, url, seekTo } */
    @PluginMethod
    public void update(PluginCall call) {
        String title     = call.getString("title");
        if (title == null) title = "AeroMusic";

        String artist    = call.getString("artist");
        if (artist == null) artist = "";

        String album     = call.getString("album");
        if (album == null) album = "";

        String artwork   = call.getString("artwork");
        if (artwork == null) artwork = "";

        Boolean playing  = call.getBoolean("isPlaying");
        if (playing == null) playing = false;

        String url       = call.getString("url");
        if (url == null) url = "";

        Double seekToDouble = call.getDouble("seekTo");
        int seekTo = seekToDouble != null ? seekToDouble.intValue() : -1;

        Intent serviceIntent = new Intent(getContext(), MediaNotificationService.class);
        serviceIntent.setAction(MediaNotificationService.ACTION_UPDATE);
        serviceIntent.putExtra("title",     title);
        serviceIntent.putExtra("artist",    artist);
        serviceIntent.putExtra("album",     album);
        serviceIntent.putExtra("artwork",   artwork);
        serviceIntent.putExtra("isPlaying", playing);
        serviceIntent.putExtra("url",       url);
        serviceIntent.putExtra("seekTo",    seekTo);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        call.resolve();
    }

    /** Called from JS when the user stops playback entirely */
    @PluginMethod
    public void dismiss(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), MediaNotificationService.class);
        serviceIntent.setAction(MediaNotificationService.ACTION_STOP);
        getContext().startService(serviceIntent);
        call.resolve();
    }

    /** Checks if the app is ignored by battery optimizations */
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        JSObject data = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            data.put("isIgnoring", pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        } else {
            data.put("isIgnoring", true);
        }
        call.resolve(data);
    }

    /** Opens battery optimization settings for the app */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent();
            intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** Returns available storage space in bytes */
    @PluginMethod
    public void getAvailableStorage(PluginCall call) {
        JSObject data = new JSObject();
        try {
            StatFs stat = new StatFs(getContext().getFilesDir().getPath());
            long bytesAvailable;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                bytesAvailable = stat.getAvailableBytes();
            } else {
                //noinspection deprecation
                bytesAvailable = (long) stat.getAvailableBlocks() * (long) stat.getBlockSize();
            }
            data.put("availableBytes", bytesAvailable);
            call.resolve(data);
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.toString();
            call.reject("Failed to get storage space: " + msg);
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (receiver != null) getContext().unregisterReceiver(receiver);
        } catch (Exception ignored) {}
    }
}
