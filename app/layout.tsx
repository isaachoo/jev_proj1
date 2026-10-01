import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev Decider",
  description: "根據你嘅位置、天氣同即時資料，幫你快速做日常決定。Powered by Jev.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2f5bea" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-HK" suppressHydrationWarning>
      <head>
        {/* PWA. Relative URLs so the same build works at / and under /<repo>/. */}
        <link rel="manifest" href="manifest.webmanifest" />
        <link rel="icon" href="icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Jev" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Apply the saved theme before paint to avoid a flash; register the service worker. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}
if("serviceWorker"in navigator)addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){})});`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
