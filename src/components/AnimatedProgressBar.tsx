import React, { useRef, useEffect } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

export const AnimatedProgressBar = ({ percent, color, bgColor, height = 12 }: { percent: number; color: string; bgColor: string; height?: number }) => {
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
    <View style={[styles.progressBarBg, { backgroundColor: bgColor, height, borderRadius: height / 2 }]}>
      <Animated.View style={[
        styles.progressBarFill,
        {
          backgroundColor: color,
          width: animatedWidth.interpolate({
            inputRange: [0, 100],
            outputRange: ['0%', '100%']
          }),
          borderRadius: height / 2
        }
      ]} />
    </View>
  );
};

const styles = StyleSheet.create({
  progressBarBg: { overflow: 'hidden', width: '100%' },
  progressBarFill: { height: '100%' },
});
