import { Capacitor } from "@capacitor/core";

// No-op entirely in the web build — only touches native APIs when actually
// running inside the Capacitor shell (Android/iOS).
export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;

  const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
    import("@capacitor/app"),
  ]);

  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.setBackgroundColor({ color: "#141928" }); // COLORS.ink, src/theme.jsx
  await SplashScreen.hide();

  // Without this, Android's back gesture/button can exit the app entirely
  // instead of navigating within the SPA.
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
}
