import React, { useRef, useEffect } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

export const AnimatedProgressBar = ({ percent, color, bgColor }: { percent: number; color: string; bgColor: string }) => {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: percent,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percent]);

  return (
    <View style={[styles.progressBarBg, { backgroundColor: bgColor }]}>
      <Animated.View style={[
        styles.progressBarFill,
        {
          backgroundColor: color,
          width: animatedWidth.interpolate({
            inputRange: [0, 100],
            outputRange: ['0%', '100%']
          })
        }
      ]} />
    </View>
  );
};

const styles = StyleSheet.create({
  progressBarBg: { height: 12, borderRadius: 6, overflow: 'hidden', width: '100%' },
  progressBarFill: { height: '100%', borderRadius: 6 },
});
