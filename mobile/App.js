import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './global.css';

import Stacks from './navigator/Stacks';
import { AppearanceProvider } from './hooks/Appearance';

export default function App() {
  const [fontsLoaded] = useFonts({
    OldEnglish: require('./assets/font/Canterbury.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      {/* Loads and applies the saved Light / Dark / System choice for the whole app. */}
      <AppearanceProvider>
        <StatusBar
          style="dark"
          backgroundColor="#1b2061"
          translucent={false}
        />
        <Stacks />
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}