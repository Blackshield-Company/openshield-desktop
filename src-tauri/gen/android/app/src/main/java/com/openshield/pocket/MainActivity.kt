package com.openshield.pocket

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  @Volatile private var insetTopPx = 0f
  @Volatile private var insetRightPx = 0f
  @Volatile private var insetBottomPx = 0f
  @Volatile private var insetLeftPx = 0f

  inner class InsetsBridge {
    @JavascriptInterface fun top(): String = "${insetTopPx}px"
    @JavascriptInterface fun right(): String = "${insetRightPx}px"
    @JavascriptInterface fun bottom(): String = "${insetBottomPx}px"
    @JavascriptInterface fun left(): String = "${insetLeftPx}px"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    // Android 15+ edge-to-edge often leaves env(safe-area-inset-*) at 0 in
    // the WebView. Push systemBars|displayCutout insets in as --os-inset-*
    // CSS variables so the Pocket shell can pad around the status and
    // gesture bars. The frontend uses max(env(), var(--os-inset-*)).
    webView.addJavascriptInterface(InsetsBridge(), "OpenShieldInsets")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val density = resources.displayMetrics.density
      insetTopPx = bars.top / density
      insetRightPx = bars.right / density
      insetBottomPx = bars.bottom / density
      insetLeftPx = bars.left / density
      injectCssVars(webView)
      insets
    }
    ViewCompat.requestApplyInsets(webView)
  }

  private fun injectCssVars(webView: WebView) {
    val js =
      "(function(){var s=document.documentElement&&document.documentElement.style;if(!s)return;" +
        "s.setProperty('--os-inset-top','${insetTopPx}px');" +
        "s.setProperty('--os-inset-right','${insetRightPx}px');" +
        "s.setProperty('--os-inset-bottom','${insetBottomPx}px');" +
        "s.setProperty('--os-inset-left','${insetLeftPx}px');" +
        "})();"
    webView.post { webView.evaluateJavascript(js, null) }
  }
}
