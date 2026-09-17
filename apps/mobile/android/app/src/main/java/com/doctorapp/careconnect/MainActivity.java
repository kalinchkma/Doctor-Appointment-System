package com.doctorapp.careconnect;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        allowMixedContent();
    }

    @Override
    public void onStart() {
        super.onStart();
        // Bridge/WebView can finish initializing after onCreate; re-apply to be safe.
        allowMixedContent();
    }

    /**
     * Assignment/dev: Capacitor serves the app as https://localhost while the LAN CMS is
     * often http://. Chromium blocks that as mixed content unless explicitly allowed.
     * CapacitorHttp (enabled in capacitor.config) is the primary fix; this is a backup.
     */
    private void allowMixedContent() {
        if (this.bridge == null) {
            return;
        }
        WebView webView = this.bridge.getWebView();
        if (webView == null) {
            return;
        }
        webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
}
