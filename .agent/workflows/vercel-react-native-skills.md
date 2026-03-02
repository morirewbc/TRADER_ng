---
description: React Native and Expo best practices for building performant mobile apps
---
1. List Performance (CRITICAL): Use FlashList, memoize items, stabilize callbacks, extract expensive work/objects.
2. Animation (HIGH): Animate only transform and opacity, use Gesture.Tap instead of Pressable, compute derived values.
3. Navigation (HIGH): Use native stack and native tabs over JS navigators.
4. UI Patterns (HIGH): Use expo-image, native modals, context menus, and safely handle insets in ScrollViews.
