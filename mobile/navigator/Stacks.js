import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabBarVisibilityProvider } from '../hooks/TabBarVisibility';
import { useAppearance } from '../hooks/Appearance';
import { ensureSession, setSessionExpiredHandler } from '../api/api';

import TabsLayout, { MyTheme, MyDarkTheme } from './Tabs';
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import ItemReviewScreen from '../screens/admin/ItemReview';
import ItemEditScreen from '../screens/admin/ItemEdit';
import ItemsScreen from '../screens/admin/ItemsScreen';
import LeaderboardsScreen from '../screens/admin/Leaderboards';
import LeaderboardHistoryScreen from '../screens/admin/LeaderboardHistory';
import HomeScreen from '../screens/HomeScreen';
import ClaimRequestScreen from '../screens/ClaimRequestScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import ClaimVerificationScreen from '../screens/admin/ClaimVerificationScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AccountDetailsScreen from '../screens/AccountDetailsScreen';
import UpdatePasswordScreen from '../screens/UpdatePasswordScreen';
import AdminProfileScreen from '../screens/admin/AdminProfileScreen';
import MySubmissionsScreen from '../screens/SubmissionScreen';
import HelpCenterScreen from '../screens/HelpCenterScreen';
import ReportIssueScreen from '../screens/ReportIssueScreen';
import IssueDetailScreen from '../screens/admin/IssueDetailScreen';
import ReportedIssuesScreen from '../screens/admin/ReportedIssuesScreen';
import MyClaimRequestsScreen from '../screens/MyClaimRequests';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import NotificationsScreen from '../screens/NotificationScreen';
import AdminNotificationsScreen from '../screens/admin/AdminNotificationScreen';
import TermsScreen from '../screens/TermsScreen';
import LostFoundDeskScreen from '../screens/LostFoundDeskScreen';

// This is the app's single NavigationContainer — Tabs.js does not have its
// own, so Splash, Login, and the tab layout all share one navigation tree.
const Stack = createNativeStackNavigator();

// Lets code outside of screens (the session-expired handler) navigate.
const navigationRef = createNavigationContainerRef();

// Screens that don't need a signed-in user. A session ending while one of
// these is open doesn't redirect anywhere.
const PUBLIC_ROUTES = ['Splash', 'Login', 'Register', 'ForgotPassword', 'Terms'];

const isOnProtectedScreen = () => {
    if (!navigationRef.isReady()) return false;
    const routeName = navigationRef.getRootState()?.routes?.slice(-1)[0]?.name;
    return !!routeName && !PUBLIC_ROUTES.includes(routeName);
};

// Clears the whole stack so Back can't return to a protected screen, and
// tells LoginScreen to show the "session expired" message.
const goToLoginExpired = () => {
    if (!isOnProtectedScreen()) return;

    navigationRef.reset({
        index: 0,
        routes: [{ name: 'Login', params: { sessionExpired: true } }],
    });
};

export default function Stacks() {
    // Switches the navigation background with the Light / Dark / System choice.
    const { isDark } = useAppearance();

    const appState = useRef(AppState.currentState);

    // Runs when api.js finds the session can no longer be refreshed.
    useEffect(() => {
        setSessionExpiredHandler(goToLoginExpired);
        return () => setSessionExpiredHandler(null);
    }, []);

    // When the app returns from the background, check the session right away
    // instead of waiting for the user's next action to fail.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', async (nextState) => {
            const wasInBackground = appState.current !== 'active';
            appState.current = nextState;

            if (!wasInBackground || nextState !== 'active') return;
            if (!isOnProtectedScreen()) return;

            const valid = await ensureSession();
            if (!valid) goToLoginExpired();
        });

        return () => subscription.remove();
    }, []);

    return (
        <NavigationContainer ref={navigationRef} theme={isDark ? MyDarkTheme : MyTheme}>
            <TabBarVisibilityProvider>   
                <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
                    {/* Main screens */}
                    <Stack.Screen name="Splash" component={SplashScreen} />
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Register" component={SignUpScreen} />
                    <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
                    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                    <Stack.Screen name="Main" component={TabsLayout} />

                    {/* Admin screens */}
                    <Stack.Screen name="ItemReview" component={ItemReviewScreen} />
                    <Stack.Screen name="ItemEdit" component={ItemEditScreen} />
                    <Stack.Screen name="Items" component={ItemsScreen} />
                    <Stack.Screen name="ClaimVerification" component={ClaimVerificationScreen} />
                    <Stack.Screen name="AdminProfile" component={AdminProfileScreen} />
                    <Stack.Screen name="IssueDetails" component={IssueDetailScreen} />
                    <Stack.Screen name="ReportedIssues" component={ReportedIssuesScreen} />
                    <Stack.Screen name="AdminNotifications" component={AdminNotificationsScreen} />

                    {/* Leaderboard screens */}
                    <Stack.Screen name="Leaderboards" component={LeaderboardsScreen} />
                    <Stack.Screen name="LeaderboardHistory" component={LeaderboardHistoryScreen} />


                    {/* Claim screens */}
                    <Stack.Screen name="ClaimRequest" component={ClaimRequestScreen} />
                    <Stack.Screen name="Home" component={HomeScreen} />

                    {/* Profile screens */}
                    <Stack.Screen name="Profile" component={ProfileScreen} />
                    <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} />
                    <Stack.Screen name="UpdatePassword" component={UpdatePasswordScreen} />
                    <Stack.Screen name="MySubmissions" component={MySubmissionsScreen} />
                    <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
                    <Stack.Screen name="ReportIssue" component={ReportIssueScreen} />
                    <Stack.Screen name="MyClaimRequests" component={MyClaimRequestsScreen} />
                    <Stack.Screen name="Terms" component={TermsScreen} />
                    <Stack.Screen name="LostFoundDesk" component={LostFoundDeskScreen} />

                    {/* Notification screens */}
                    <Stack.Screen name="Notifications" component={NotificationsScreen} />
                </Stack.Navigator>
            </TabBarVisibilityProvider>
        </NavigationContainer>
    );
}