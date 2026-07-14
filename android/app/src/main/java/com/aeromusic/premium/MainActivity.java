package com.aeromusic.premium;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Handle the splash screen transition as per androidx.core:core-splashscreen
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
    }
}
