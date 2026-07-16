package com.aeromusic.premium;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(MediaNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Undo both the WebView renderer pause AND the JS timer pause.
        // Without resumeTimers(), all setInterval/setTimeout stop running in background,
        // which kills the progress tracking and playback recovery loops.
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().onResume();
                getBridge().getWebView().resumeTimers();
            }
        } catch (Exception ignored) {}
    }
}
