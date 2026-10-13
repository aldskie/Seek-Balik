import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import * as ImageManipulator from 'expo-image-manipulator';
import { Minus, Plus } from 'lucide-react-native';

const NAVY = '#1b2061';
const { width: SCREEN_W } = Dimensions.get('window');

const STAGE = SCREEN_W; // square area the user drags/zooms the photo in
const CROP = SCREEN_W - 48; // diameter of the circle
const MAX_ZOOM = 5; // x the minimum scale
const OUTPUT_SIZE = 512; // final square size in px

/**
 * Circular photo cropper.
 * Drag to move, pinch (or use +/-) to zoom. Returns a square JPEG of the area
 * inside the circle; display it in a rounded-full container to get a circle.
 */
export default function CircleCropModal({ visible, uri, onCancel, onDone }) {
  const [imgSize, setImgSize] = useState(null);
  const [view, setView] = useState({ s: 1, tx: 0, ty: 0 });
  const [busy, setBusy] = useState(false);

  // Refs let the PanResponder (created once) always read the latest values.
  const sizeRef = useRef(null);
  const viewRef = useRef(view);
  const gestureRef = useRef({ start: view, base: { dx: 0, dy: 0 }, dist: 0, touches: 0 });

  // Keeps the photo covering the whole circle and within zoom limits.
  const clamp = (v) => {
    const size = sizeRef.current;
    if (!size) return v;

    const min = CROP / Math.min(size.w, size.h);
    const s = Math.min(Math.max(v.s, min), min * MAX_ZOOM);
    const maxX = Math.max((size.w * s - CROP) / 2, 0);
    const maxY = Math.max((size.h * s - CROP) / 2, 0);

    return {
      s,
      tx: Math.min(Math.max(v.tx, -maxX), maxX),
      ty: Math.min(Math.max(v.ty, -maxY), maxY),
    };
  };

  const applyView = (next) => {
    const clamped = clamp(next);
    viewRef.current = clamped;
    setView(clamped);
  };

  // Load the photo size and start centered at the minimum zoom.
  useEffect(() => {
    if (!visible || !uri) return;

    sizeRef.current = null;
    setImgSize(null);

    Image.getSize(
      uri,
      (w, h) => {
        sizeRef.current = { w, h };
        setImgSize({ w, h });
        applyView({ s: CROP / Math.min(w, h), tx: 0, ty: 0 });
      },
      () => onCancel?.()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, uri]);

  const touchDistance = (touches) =>
    Math.hypot(
      touches[0].pageX - touches[1].pageX,
      touches[0].pageY - touches[1].pageY
    );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gestureRef.current = {
          start: viewRef.current,
          base: { dx: 0, dy: 0 },
          dist: 0,
          touches: 0,
        };
      },
      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches;
        const gs = gestureRef.current;

        // Re-baseline whenever a finger is added/removed so the photo doesn't jump.
        if (touches.length !== gs.touches) {
          gs.touches = touches.length;
          gs.start = viewRef.current;
          gs.base = { dx: g.dx, dy: g.dy };
          gs.dist = touches.length >= 2 ? touchDistance(touches) : 0;
        }

        const factor =
          touches.length >= 2 && gs.dist > 0
            ? touchDistance(touches) / gs.dist
            : 1;

        applyView({
          s: gs.start.s * factor,
          tx: gs.start.tx + (g.dx - gs.base.dx),
          ty: gs.start.ty + (g.dy - gs.base.dy),
        });
      },
    })
  ).current;

  const zoomBy = (factor) => {
    applyView({ ...viewRef.current, s: viewRef.current.s * factor });
  };

  const handleDone = async () => {
    if (!imgSize || busy) return;

    const { s, tx, ty } = viewRef.current;

    // Convert the circle's bounding square from screen px to photo px.
    const side = Math.min(Math.round(CROP / s), imgSize.w, imgSize.h);
    const originX = Math.round(imgSize.w / 2 - (tx + CROP / 2) / s);
    const originY = Math.round(imgSize.h / 2 - (ty + CROP / 2) / s);

    const x = Math.min(Math.max(originX, 0), imgSize.w - side);
    const y = Math.min(Math.max(originY, 0), imgSize.h - side);

    setBusy(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [
          { crop: { originX: x, originY: y, width: side, height: side } },
          { resize: { width: OUTPUT_SIZE } },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      onDone?.(result.uri);
    } catch (err) {
      console.error('Failed to crop photo:', err);
      onCancel?.();
    } finally {
      setBusy(false);
    }
  };

  // Dark overlay with a circular hole (even-odd fill) + white ring.
  const c = STAGE / 2;
  const r = CROP / 2;
  const maskPath = `M0 0H${STAGE}V${STAGE}H0Z M${c - r} ${c} a${r} ${r} 0 1 0 ${CROP} 0 a${r} ${r} 0 1 0 ${-CROP} 0Z`;

  const imageStyle = imgSize
    ? {
        position: 'absolute',
        width: imgSize.w * view.s,
        height: imgSize.h * view.s,
        left: STAGE / 2 + view.tx - (imgSize.w * view.s) / 2,
        top: STAGE / 2 + view.ty - (imgSize.h * view.s) / 2,
      }
    : null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black">
        <SafeAreaView edges={['top']}>
          <View className="items-center px-4 pb-3 pt-3">
            <Text className="text-base font-bold text-white">Move and zoom</Text>
            <Text className="mt-1 text-xs text-white/60">
              Drag to reposition, pinch to zoom.
            </Text>
          </View>
        </SafeAreaView>

        <View className="flex-1 items-center justify-center">
          <View
            style={{ width: STAGE, height: STAGE, overflow: 'hidden' }}
            {...panResponder.panHandlers}
          >
            {imgSize ? (
              <Image
                source={{ uri }}
                style={imageStyle}
                resizeMode="cover"
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#FFFFFF" />
              </View>
            )}

            <Svg
              width={STAGE}
              height={STAGE}
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, top: 0 }}
            >
              <Path d={maskPath} fill="rgba(0,0,0,0.65)" fillRule="evenodd" />
              <Circle
                cx={c}
                cy={c}
                r={r}
                stroke="#FFFFFF"
                strokeWidth={2}
                fill="none"
              />
            </Svg>
          </View>

          <View className="mt-5 flex-row items-center">
            <TouchableOpacity
              onPress={() => zoomBy(1 / 1.25)}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
              accessibilityLabel="Zoom out"
            >
              <Minus size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => zoomBy(1.25)}
              className="ml-4 h-10 w-10 items-center justify-center rounded-full bg-white/15"
              accessibilityLabel="Zoom in"
            >
              <Plus size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <SafeAreaView edges={['bottom']}>
          <View className="flex-row gap-3 px-4 pb-4 pt-2">
            <TouchableOpacity
              onPress={onCancel}
              disabled={busy}
              className="h-12 flex-1 items-center justify-center rounded-xl border border-white/30"
            >
              <Text className="text-sm font-semibold text-white">Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDone}
              disabled={busy || !imgSize}
              className={`h-12 flex-1 items-center justify-center rounded-xl bg-white ${
                busy || !imgSize ? 'opacity-60' : ''
              }`}
            >
              {busy ? (
                <ActivityIndicator color={NAVY} />
              ) : (
                <Text className="text-sm font-bold text-[#1b2061]">Choose</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}