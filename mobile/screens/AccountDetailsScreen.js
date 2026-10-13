import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BadgeCheck,
  Camera,
  Check,
  ChevronLeft,
  CreditCard,
  Lock,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react-native';

// updateCurrentUser must exist in ../api/api (see the note at the bottom of this file).
import { getCurrentUser, updateCurrentUser } from '../api/api';
import { useAppearance } from '../hooks/Appearance';
import PhotoPickerModal from '../components/PhotoPickerModal';
import CircleCropModal from '../components/CircleCropModal';

const NAVY = '#1b2061';

// Class strings reused below, each with its light and dark colors.
const CARD = 'border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none';
const ROW_DIVIDER = 'border-b border-slate-100 dark:border-slate-800';
const ICON_TILE = 'mr-3 h-10 w-10 items-center justify-center rounded-xl bg-[#EEF1F7] dark:bg-slate-800';
const ROW_LABEL = 'text-[11px] font-bold tracking-wide text-slate-400';
const ROW_VALUE = 'mt-0.5 text-[15px] font-semibold text-[#16233F] dark:text-slate-100';
const ROW_INPUT =
  'mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[15px] font-semibold text-[#16233F] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const ROW_INPUT_ERROR = 'border-rose-400 dark:border-rose-500';
const FIELD_ERROR = 'mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400';

// Accepts 09XXXXXXXXX or +639XXXXXXXXX.
const PH_MOBILE = /^(09\d{9}|\+639\d{9})$/;

export default function AccountDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // Icon and spinner colors follow the app's Light / Dark appearance.
  const { isDark } = useAppearance();
  const navyIcon = isDark ? '#C7D2FE' : NAVY;
  const placeholderColor = isDark ? '#64748B' : '#94A3B8';

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit mode state.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', contactNumber: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveError, setSaveError] = useState('');

  const [photoUri, setPhotoUri] = useState(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  // Photo waiting to be cropped in the circular cropper.
  const [cropSource, setCropSource] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((value) => {
        if (!cancelled) setAccount(value || null);
      })
      .catch(() => {
        if (!cancelled) setError('We could not load your account information. Please check your connection and sign in again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = account?.first_name || account?.firstName || '';
  const lastName = account?.last_name || account?.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'Student Account';

  const idNumber = String(
    account?.student_id || account?.school_id || account?.schoolId || account?.id_number || account?.username || account?.email || '',
  )
    .replace(/\D/g, '')
    .slice(0, 8);

  const contactNumber = account?.contact_number || account?.contact || account?.phone || account?.phone_number || '';

  const initials =
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'SA';

  // Each account gets its own stored photo so switching users doesn't show the wrong picture.
  const photoStorageKey = account?.email || account?.id ? `profile_photo:${account.email || account.id}` : null;

  // Load the saved photo once the account is known.
  useEffect(() => {
    if (!photoStorageKey) return;
    let cancelled = false;

    AsyncStorage.getItem(photoStorageKey)
      .then((saved) => {
        if (!cancelled && saved) setPhotoUri(saved);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [photoStorageKey]);

  const savePhoto = async (uri) => {
    setPhotoUri(uri);
    if (!photoStorageKey) return;
    try {
      await AsyncStorage.setItem(photoStorageKey, uri);
    } catch (err) {
      console.error('Failed to save profile photo:', err);
    }
  };

  const removePhoto = async () => {
    setPhotoUri(null);
    if (!photoStorageKey) return;
    try {
      await AsyncStorage.removeItem(photoStorageKey);
    } catch (err) {
      console.error('Failed to remove profile photo:', err);
    }
  };

  const selectFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo library access to choose a profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setCropSource(result.assets[0].uri);
    }
  };

  const captureWithCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow camera access to take a profile photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setCropSource(result.assets[0].uri);
    }
  };

  // ----- Editing -----

  const startEditing = () => {
    setForm({ firstName, lastName, contactNumber: String(contactNumber) });
    setFieldErrors({});
    setSaveError('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setFieldErrors({});
    setSaveError('');
  };

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (values) => {
    const errors = {};
    if (!values.firstName) errors.firstName = 'First name is required.';
    if (!values.lastName) errors.lastName = 'Last name is required.';
    if (values.contactNumber && !PH_MOBILE.test(values.contactNumber)) {
      errors.contactNumber = 'Use the format 09XXXXXXXXX or +639XXXXXXXXX.';
    }
    return errors;
  };

  const saveChanges = async () => {
    const values = {
      firstName: form.firstName.trim().replace(/\s+/g, ' '),
      lastName: form.lastName.trim().replace(/\s+/g, ' '),
      contactNumber: form.contactNumber.replace(/[\s-]/g, ''),
    };

    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Nothing changed: just leave edit mode.
    if (values.firstName === firstName && values.lastName === lastName && values.contactNumber === String(contactNumber)) {
      setEditing(false);
      return;
    }

    if (typeof updateCurrentUser !== 'function') {
      setSaveError('Saving is not set up yet: updateCurrentUser is missing from api/api.js.');
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      const updated = await updateCurrentUser({
        first_name: values.firstName,
        last_name: values.lastName,
        contact_number: values.contactNumber,
      });

      // Use whatever the server sent back, then make sure every field name
      // this screen reads from carries the new values.
      setAccount((prev) => ({
        ...(prev || {}),
        ...(updated && typeof updated === 'object' ? updated : {}),
        first_name: values.firstName,
        firstName: values.firstName,
        last_name: values.lastName,
        lastName: values.lastName,
        contact_number: values.contactNumber,
        contact: values.contactNumber,
        phone: values.contactNumber,
        phone_number: values.contactNumber,
      }));

      setEditing(false);
    } catch (err) {
      console.error('Failed to update account:', err);
      setSaveError(err?.message || 'We could not save your changes. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const canEdit = !loading && !!account;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/15"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-[12px] font-bold tracking-widest text-white/60">SEEK AND BALIK</Text>
            <Text className="text-2xl font-bold text-white">Account Details</Text>
          </View>

          {/* Edit button (hidden while editing or before the account loads) */}
          {canEdit && !editing && (
            <TouchableOpacity
              onPress={startEditing}
              accessibilityLabel="Edit account information"
              className="flex-row items-center rounded-full bg-white/15 px-4 py-2.5"
            >
              <Pencil size={14} color="#FFFFFF" />
              <Text className="ml-1.5 text-sm font-bold text-white">Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 24 }}
        >
          <View className={`items-center rounded-3xl px-5 py-8 ${CARD}`}>
            {/* Pressable avatar: tap to take or choose a photo */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setPhotoModalVisible(true)}
              accessibilityLabel="Change profile photo"
              className="relative"
            >
              <View className="h-24 w-24 overflow-hidden rounded-full border-4 border-[#EEF1F7] dark:border-slate-700">
                {photoUri ? (
                  <Image
                    source={{ uri: photoUri }}
                    className="h-full w-full"
                    resizeMode="cover"
                    // If the saved file no longer exists, fall back to initials.
                    onError={removePhoto}
                  />
                ) : (
                  // Flat color behind the initials (no gradient).
                  <View className="h-full w-full items-center justify-center bg-[#1b2061] dark:bg-indigo-600">
                    <Text className="text-2xl font-bold text-white">{initials}</Text>
                  </View>
                )}
              </View>

              <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#1b2061] dark:border-slate-900 dark:bg-indigo-600">
                <Camera size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {photoUri ? (
              <TouchableOpacity onPress={removePhoto} className="mt-3 flex-row items-center">
                <Trash2 size={12} color={isDark ? '#FB7185' : '#E11D48'} />
                <Text className="ml-1 text-xs font-semibold text-rose-600 dark:text-rose-400">Remove photo</Text>
              </TouchableOpacity>
            ) : (
              <Text className="mt-3 text-xs text-slate-400">Tap the photo to upload</Text>
            )}

            {loading ? (
              <View className="mt-5 flex-row items-center">
                <ActivityIndicator size="small" color={navyIcon} />
                <Text className="ml-2 text-sm text-slate-500 dark:text-slate-400">Loading account…</Text>
              </View>
            ) : (
              <>
                <Text className="mt-4 text-xl font-bold text-[#16233F] dark:text-slate-100">{fullName}</Text>
                <View className="mt-2 flex-row items-center rounded-full bg-indigo-50 px-3 py-1.5 dark:bg-indigo-950">
                  <BadgeCheck size={13} color={isDark ? '#A5B4FC' : '#4F46E5'} />
                  <Text className="ml-1 text-xs font-bold capitalize text-indigo-600 dark:text-indigo-300">{account?.role || 'student'}</Text>
                </View>
              </>
            )}
          </View>

          {!!error && (
            <View className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950">
              <Text className="text-sm font-semibold leading-5 text-rose-700 dark:text-rose-300">{error}</Text>
            </View>
          )}

          <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Personal Information</Text>

          <View className={`overflow-hidden rounded-2xl ${CARD}`}>
            {editing ? (
              <>
                {/* First name (editable) */}
                <View className={`flex-row items-start px-4 py-4 ${ROW_DIVIDER}`}>
                  <View className={ICON_TILE}>
                    <UserRound size={18} color={navyIcon} />
                  </View>
                  <View className="flex-1">
                    <Text className={ROW_LABEL}>FIRST NAME</Text>
                    <TextInput
                      value={form.firstName}
                      onChangeText={(text) => setField('firstName', text)}
                      placeholder="First name"
                      placeholderTextColor={placeholderColor}
                      autoCapitalize="words"
                      autoCorrect={false}
                      maxLength={50}
                      editable={!saving}
                      returnKeyType="next"
                      className={`${ROW_INPUT} ${fieldErrors.firstName ? ROW_INPUT_ERROR : ''}`}
                    />
                    {!!fieldErrors.firstName && <Text className={FIELD_ERROR}>{fieldErrors.firstName}</Text>}
                  </View>
                </View>

                {/* Last name (editable) */}
                <View className={`flex-row items-start px-4 py-4 ${ROW_DIVIDER}`}>
                  <View className={ICON_TILE}>
                    <UserRound size={18} color={navyIcon} />
                  </View>
                  <View className="flex-1">
                    <Text className={ROW_LABEL}>LAST NAME</Text>
                    <TextInput
                      value={form.lastName}
                      onChangeText={(text) => setField('lastName', text)}
                      placeholder="Last name"
                      placeholderTextColor={placeholderColor}
                      autoCapitalize="words"
                      autoCorrect={false}
                      maxLength={50}
                      editable={!saving}
                      returnKeyType="next"
                      className={`${ROW_INPUT} ${fieldErrors.lastName ? ROW_INPUT_ERROR : ''}`}
                    />
                    {!!fieldErrors.lastName && <Text className={FIELD_ERROR}>{fieldErrors.lastName}</Text>}
                  </View>
                </View>
              </>
            ) : (
              <View className={`flex-row items-center px-4 py-4 ${ROW_DIVIDER}`}>
                <View className={ICON_TILE}>
                  <UserRound size={18} color={navyIcon} />
                </View>
                <View className="flex-1">
                  <Text className={ROW_LABEL}>FULL NAME</Text>
                  <Text className={ROW_VALUE}>{loading ? 'Loading…' : fullName}</Text>
                </View>
              </View>
            )}

            {/* ID number (always read-only) */}
            <View className={`flex-row items-center px-4 py-4 ${ROW_DIVIDER}`}>
              <View className={ICON_TILE}>
                <CreditCard size={18} color={navyIcon} />
              </View>
              <View className="flex-1">
                <Text className={ROW_LABEL}>ID NUMBER</Text>
                <Text className={ROW_VALUE}>{loading ? 'Loading…' : idNumber || 'Not available'}</Text>
              </View>
              {editing && <Lock size={14} color={placeholderColor} />}
            </View>

            {/* Email (always read-only) */}
            <View className={`flex-row items-center px-4 py-4 ${ROW_DIVIDER}`}>
              <View className={ICON_TILE}>
                <Mail size={18} color={navyIcon} />
              </View>
              <View className="flex-1">
                <Text className={ROW_LABEL}>GSUITE EMAIL</Text>
                <Text numberOfLines={1} className={ROW_VALUE}>
                  {loading ? 'Loading…' : account?.email || 'Not available'}
                </Text>
              </View>
              {editing && <Lock size={14} color={placeholderColor} />}
            </View>

            {/* Contact number (editable) */}
            <View className={`flex-row px-4 py-4 ${editing ? 'items-start' : 'items-center'}`}>
              <View className={ICON_TILE}>
                <Phone size={18} color={navyIcon} />
              </View>
              <View className="flex-1">
                <Text className={ROW_LABEL}>CONTACT NUMBER</Text>
                {editing ? (
                  <>
                    <TextInput
                      value={form.contactNumber}
                      onChangeText={(text) => setField('contactNumber', text.replace(/[^\d+\s-]/g, ''))}
                      placeholder="09XXXXXXXXX"
                      placeholderTextColor={placeholderColor}
                      keyboardType="phone-pad"
                      maxLength={16}
                      editable={!saving}
                      returnKeyType="done"
                      onSubmitEditing={saveChanges}
                      className={`${ROW_INPUT} ${fieldErrors.contactNumber ? ROW_INPUT_ERROR : ''}`}
                    />
                    {!!fieldErrors.contactNumber && <Text className={FIELD_ERROR}>{fieldErrors.contactNumber}</Text>}
                  </>
                ) : (
                  <Text className={ROW_VALUE}>{loading ? 'Loading…' : contactNumber || 'Not available'}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Save / Cancel shown only in edit mode */}
          {editing && (
            <>
              {!!saveError && (
                <View className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950">
                  <Text className="text-sm font-semibold leading-5 text-rose-700 dark:text-rose-300">{saveError}</Text>
                </View>
              )}

              <View className="mt-4 flex-row">
                <TouchableOpacity
                  onPress={cancelEditing}
                  disabled={saving}
                  className="mr-3 h-12 flex-1 flex-row items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                >
                  <X size={16} color={isDark ? '#CBD5E1' : '#475569'} />
                  <Text className="ml-1.5 text-sm font-bold text-slate-600 dark:text-slate-300">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={saveChanges}
                  disabled={saving}
                  className={`h-12 flex-1 flex-row items-center justify-center rounded-2xl bg-[#1b2061] dark:bg-indigo-600 ${saving ? 'opacity-60' : ''}`}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Check size={16} color="#FFFFFF" />
                      <Text className="ml-1.5 text-sm font-bold text-white">Save changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          <View className="mt-5 flex-row items-start rounded-2xl border border-[#DCE6FF] bg-[#EEF3FF] p-4 dark:border-indigo-900 dark:bg-indigo-950">
            <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-900">
              <ShieldCheck size={16} color={navyIcon} />
            </View>
            <Text className="flex-1 text-xs leading-5 text-[#334155] dark:text-slate-300">
              You can edit your name and contact number. Your ID number and GSuite email identify your account and cannot be changed here. Your profile photo is stored on this device.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Circular cropper shown after a photo is picked */}
      <CircleCropModal
        visible={Boolean(cropSource)}
        uri={cropSource}
        onCancel={() => setCropSource(null)}
        onDone={async (croppedUri) => {
          setCropSource(null);
          await savePhoto(croppedUri);
        }}
      />

      {/* Same photo picker used in ReportLostItemScreen, limited to one image */}
      <PhotoPickerModal
        visible={photoModalVisible}
        maxImages={1}
        onClose={() => setPhotoModalVisible(false)}
        onCamera={async () => {
          setPhotoModalVisible(false);
          await captureWithCamera();
        }}
        onLibrary={async () => {
          setPhotoModalVisible(false);
          await selectFromLibrary();
        }}
      />
    </View>
  );
}

/*
 * This screen calls updateCurrentUser(payload) from ../api/api with:
 *   { first_name, last_name, contact_number }
 * It should send the update to your backend, return the updated user object,
 * and throw an Error (with a readable message) if the request fails.
 */