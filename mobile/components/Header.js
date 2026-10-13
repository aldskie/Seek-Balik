import React from 'react';
import { View, Text, Image, ImageBackground, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Header({
  logoSource = require('../assets/image/slc_logo.png'),
  backgroundSource = require('../assets/image/slc.png'),
}) {
  const insets = useSafeAreaInsets();

  return (
    <View className="bg-white dark:bg-slate-950">
      <StatusBar barStyle="light-content" />

      <ImageBackground
        source={backgroundSource}
        className="w-full justify-center"
        style={{ height: 110 + insets.top }}
        imageStyle={{ resizeMode: 'cover' }}
      >
        {/* Flat blue tint over the background photo — extends behind the
            status bar/notch so the banner still fills that area with color.
            Slightly deeper in dark mode so the banner doesn't glare. */}
        <View className="absolute inset-0 bg-[#1e2a5e]/70 dark:bg-[#0f1638]/85" />

        <View
          className="flex-row items-center px-4"
        >
          <Image
            source={logoSource}
            className="w-20 h-20 ml-5"
            resizeMode="contain"
          />

          <View className="flex-1 items-center">
            <Text
              className="text-white text-3xl text-center"
              style={{ fontFamily: 'OldEnglish' }}
            >
              Saint Louis College
            </Text>
            <Text className="text-[#e6e9f5] text-[13px] text-center mt-0.5" style={{ fontFamily: 'serif' }}>
              of San Fernando, La Union
            </Text>
            <Text className="text-[#cfd6ee] text-[11px] italic text-center mt-1" style={{ fontFamily: 'serif' }}>
              The Beacon of Wisdom in the North
            </Text>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}