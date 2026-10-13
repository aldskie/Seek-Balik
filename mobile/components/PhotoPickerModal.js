// components/PhotoPickerModal.jsx
import React from 'react';
import {
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, Image as ImageIcon } from 'lucide-react-native';

import { useAppearance } from '../hooks/Appearance';

export default function PhotoPickerModal({
  visible,
  onClose,
  onCamera,
  onLibrary,
  maxImages = 3,
}) {
  // Icon color follows the app's Light / Dark appearance.
  const { isDark } = useAppearance();
  const iconColor = isDark ? '#C7D2FE' : '#1b2061';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/40 px-5 dark:bg-black/60">
        <View className="w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900">
          <View className="bg-[#1b2061] px-5 py-4">
            <Text className="text-lg font-bold text-white">Add Photo</Text>

            <Text className="mt-1 text-xs text-white/75">
              Upload up to {maxImages} photos of the item.
            </Text>
          </View>

          <View className="p-5">
            <TouchableOpacity
              onPress={onCamera}
              className="mb-3 flex-row items-center rounded-xl bg-[#EEF1F7] px-4 py-4 dark:bg-slate-800"
            >
              <Camera size={22} color={iconColor} />

              <View className="ml-3">
                <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
                  Take a photo
                </Text>

                <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Use your device camera
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onLibrary}
              className="flex-row items-center rounded-xl bg-[#EEF1F7] px-4 py-4 dark:bg-slate-800"
            >
              <ImageIcon size={22} color={iconColor} />

              <View className="ml-3">
                <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
                  Choose from library
                </Text>

                <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Select existing photos
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              className="mt-4 h-11 items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700"
            >
              <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}