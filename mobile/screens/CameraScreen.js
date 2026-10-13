import React from 'react';
import { View, Text } from 'react-native';

// Placeholder only — wire up expo-camera / expo-image-picker here later.
export default function CameraScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-[#f4f5f7] px-6">
      <Text className="text-[#1e2a5e] text-xl font-bold text-center">
        Camera
      </Text>
      <Text className="text-[#777] text-sm text-center mt-2">
        Camera capture will be wired up here later.
      </Text>
    </View>
  );
}