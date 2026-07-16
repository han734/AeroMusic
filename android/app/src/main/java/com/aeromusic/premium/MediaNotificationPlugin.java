package com.aeromusic.premium;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

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
        String title     = call.getString("title",    "AeroMusic");
        String artist    = call.getString("artist",   "");
        String album     = call.getString("album",    "");
        String artwork   = call.getString("artwork",  "");
        Boolean playing  = call.getBoolean("isPlaying", false);
        String url       = call.getString("url",      "");
        Integer seekTo   = call.getInt("seekTo",      -1);

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

    @Override
    protected void handleOnDestroy() {
        try {
            if (receiver != null) getContext().unregisterReceiver(receiver);
        } catch (Exception ignored) {}
    }
}
