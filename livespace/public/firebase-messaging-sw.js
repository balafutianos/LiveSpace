/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAUXJ-wy4dZjBzCJnFARKmiRO57S7cfKqA",
  authDomain: "livespacezone.firebaseapp.com",
  projectId: "livespacezone",
  storageBucket: "livespacezone.appspot.com",
  messagingSenderId: "456717202137",
  appId: "1:456717202137:web:f2b8313a77ae9f162404c8",
});

const messaging = firebase.messaging();

// Background notifications (tab closed/background)
// The OS/Browser plays its default sound.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "New message";
  const body  = payload.notification?.body  || "You’ve received a new message.";
  const icon  = payload.notification?.icon  || "/icon-192.png";

  self.registration.showNotification(title, {
    body,
    icon,
    data: payload.data || {},
    // no custom 'sound' key support in web push on desktop
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/messages";
  event.waitUntil(clients.openWindow(url));
});
