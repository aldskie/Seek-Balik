import React, { useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Easing, Text, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const BACKGROUND_COLOR = '#1b2061';

const STATUS_MESSAGES = [
    'Initializing...',
    'Please wait...',
];

const STATUS_INTERVAL_MS = 1500;
const LOGO_FADE_DURATION_MS = 1000;

export default function SplashScreen({ navigation }) {

    // Logo starts fully transparent: only the white box is visible at first
    const logoOpacity = useRef(new Animated.Value(0)).current;

    const [statusIndex, setStatusIndex] = useState(0);

    useEffect(() => {
        Animated.timing(logoOpacity, {
            toValue: 1,
            duration: LOGO_FADE_DURATION_MS,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
        }).start();
    }, [logoOpacity]);

    useEffect(() => {
        const interval = setInterval(() => {
            setStatusIndex((current) => (current + 1) % STATUS_MESSAGES.length);
        }, STATUS_INTERVAL_MS);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            navigation.replace('Login');
        }, 3000);

        return () => clearTimeout(timer);
    }, [navigation]);

    return (
        <View className="flex-1" style={{ backgroundColor: BACKGROUND_COLOR }}>
            <StatusBar style="light" backgroundColor={BACKGROUND_COLOR} translucent={false} />

            <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
                {/* Centered branding block */}
                <View className="flex-1 items-center justify-center px-8">
                    {/* Static white box (no scaling/pulse) */}
                    <View className="h-28 w-28 items-center justify-center rounded-3xl bg-white">
                        {/* Only the logo itself fades in */}
                        <Animated.View style={{ opacity: logoOpacity }}>
                            <Image source={require('../assets/image/sabb.png')} className='w-20 h-20' resizeMode='center' />
                        </Animated.View>
                    </View>

                    <View className="items-center justify-center px-4 mt-6">
                        {/* Title */}
                        <View className="flex-row items-center mb-1">
                            <Text className="text-3xl font-extrabold text-white tracking-widest">SEEK </Text>
                            <Text className="text-3xl font-bold text-blue-300 tracking-widest">&</Text>
                            <Text className="text-3xl font-extrabold text-white tracking-widest"> BALIK</Text>
                        </View>

                        {/* Divider with Dot */}
                        <View className="flex-row items-center w-full my-1">
                            <View className="flex-1 h-[1px] bg-[#8EB2DF]" />
                            <View className="w-1.5 h-1.5 rounded bg-[#3B71CA] mx-2" />
                            <View className="flex-1 h-[1px] bg-[#8EB2DF]" />
                        </View>

                        {/* Tagline */}
                        <Text className="text-[9px] font-semibold text-white/60 tracking-[3px] mt-1 text-center">
                            LOST AND FOUND MANAGEMENT SYSTEM
                        </Text>
                    </View>

                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginTop: 32 }} />

                    <Text className="mt-4 text-sm text-white/70">
                        {STATUS_MESSAGES[statusIndex]}
                    </Text>
                </View>

                {/* Footer tag */}
                <Text className="mb-2 text-center text-xs text-white/40">
                    v1.0.2 • SAO System
                </Text>
            </SafeAreaView>
        </View>
    );
}