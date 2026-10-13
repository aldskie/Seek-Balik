// hooks/PushNotifications.js
//
// Real push notifications (shown by the phone even when the app is closed).
//
// CURRENTLY TURNED OFF (PUSH_ENABLED = false below). The app has no Firebase
// setup (no google-services.json), and Android release builds need it for
// remote push. With push off, nothing here asks for notification
// permission or contacts Expo/Firebase, and the app uses in-app
// notifications only (the bell). To turn push back on later: add Firebase
// (google-services.json + "googleServicesFile" in app.json), upload the FCM
// key with `eas credentials`, then set PUSH_ENABLED = true.
//
// Also: this never works in Expo Go. Expo Go cannot receive remote push on
// Android, so everything here quietly does nothing there.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

import { registerPushToken, removePushToken } from '../api/api';

// Master switch for real push notifications. See the note above.
const PUSH_ENABLED = false;

// Where this phone's token is remembered, so logout can remove it.
const TOKEN_KEY = 'expoPushToken';

const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  Constants.appOwnership === 'expo';

let handlerConfigured = false;

// expo-notifications is loaded only when push is on and outside Expo Go,
// because loading it inside Expo Go on Android logs an error.
const loadNotifications = () => {
  if (!PUSH_ENABLED || isExpoGo) return null;

  const Notifications = require('expo-notifications');

  if (!handlerConfigured) {
    handlerConfigured = true;

    // Show the banner even while the app is open.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }

  return Notifications;
};

// Asks for permission, gets this phone's Expo push token and saves it on the
// backend for the logged-in account.
//
// Returns { status } where status is one of:
//   'registered' — the phone will receive pushes
//   'disabled'   — push is turned off in this app (PUSH_ENABLED = false)
//   'expo-go'    — running in Expo Go, push unavailable
//   'no-device'  — emulator/simulator, push unavailable
//   'denied'     — the user has notifications blocked for this app
//   'error'      — something else failed (see console)
export async function registerForPushNotifications() {
  if (!PUSH_ENABLED) return { status: 'disabled' };

  const Notifications = loadNotifications();
  if (!Notifications) return { status: 'expo-go' };
  if (!Device.isDevice) return { status: 'no-device' };

  try {
    if (Platform.OS === 'android') {
      // Android needs a channel before any notification can be shown.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Seek & Balik updates',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return { status: 'denied' };

    // Added to app.json by `eas init`.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('Push: no EAS projectId in app.json. Run "eas init".');
      return { status: 'error' };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await registerPushToken(token, Platform.OS);
    await SecureStore.setItemAsync(TOKEN_KEY, token);

    return { status: 'registered' };
  } catch (error) {
    console.warn('Push: could not register this phone.', error);
    return { status: 'error' };
  }
}

// Removes this phone's token from the backend. Call BEFORE logoutUser(),
// while the access token is still available. Never throws.
// (With push off there is never a saved token, so this does nothing.)
export async function unregisterPushNotifications() {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;

    await removePushToken(token);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    // Offline or already logged out: the backend also drops dead tokens.
  }
}

// onReceive: a push arrived while the app is open.
// onTap: the user tapped a push (app open, in the background, or closed).
// Returns a function that removes the listeners.
export function addPushListeners({ onReceive, onTap } = {}) {
  const Notifications = loadNotifications();
  if (!Notifications) return () => {};

  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => onReceive?.(notification)
  );

  const tapSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => onTap?.(response)
  );

  return () => {
    receivedSubscription.remove();
    tapSubscription.remove();
  };
}