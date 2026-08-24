import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <ScrollViewStyleReset />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function () { if (!('serviceWorker' in navigator)) return; var host = window.location.hostname; var isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'; window.addEventListener('load', function () { if (isLocalhost) { navigator.serviceWorker.getRegistrations().then(function (registrations) { registrations.forEach(function (registration) { registration.unregister(); }); }); if ('caches' in window) { caches.keys().then(function (keys) { keys.forEach(function (key) { caches.delete(key); }); }); } return; } navigator.serviceWorker.register('/service-worker.js').catch(function () {}); }); })();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
