import React from 'react';
import { View, Text } from 'react-native';

export default function Footer() {
  return (
    <View className="items-end py-3.5 px-6 bg-[#f4f5f7] border-t border-[#e2e4e8] dark:bg-slate-950 dark:border-slate-800">
      <Text className="text-[#777] text-[11px] text-center dark:text-slate-500">
        © 2021 Saint Louis College, City of San Fernando, La Union. All rights reserved
      </Text>
    </View>
  );
}