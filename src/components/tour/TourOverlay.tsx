import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Text, TouchableOpacity } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  useAnimatedProps,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
  FadeInUp,
  FadeInDown,
  FadeOut
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTour } from './TourContext';
import { useTheme } from '../../theme/ThemeContext';
import { ChevronRight, X, Sparkles, Zap, PlusCircle, PieChart, Clock, CreditCard, BarChart2, Unlock, ShoppingBag, CheckCircle, Trash2 } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const PADDING = 8;

const getIcon = (name?: string, color: string = '#FFF') => {
  switch (name) {
    case 'Sparkles': return <Sparkles size={28} color={color} />;
    case 'Zap': return <Zap size={28} color={color} />;
    case 'PlusCircle': return <PlusCircle size={28} color={color} />;
    case 'PieChart': return <PieChart size={28} color={color} />;
    case 'Clock': return <Clock size={28} color={color} />;
    case 'CreditCard': return <CreditCard size={28} color={color} />;
    case 'BarChart2': return <BarChart2 size={28} color={color} />;
    case 'Unlock': return <Unlock size={28} color={color} />;
    case 'Store': return <ShoppingBag size={28} color={color} />;
    case 'Check': return <CheckCircle size={28} color={color} />;
    case 'Trash2': return <Trash2 size={28} color={color} />;
    default: return <Sparkles size={28} color={color} />;
  }
};

export const TourOverlay = () => {
  const { isActive, currentElementLayout, currentStepData, nextStep, stopTour, steps, currentStepIndex, globalProgress } = useTour();
  const { theme } = useTheme();

  const holeX = useSharedValue(SCREEN_WIDTH / 2);
  const holeY = useSharedValue(SCREEN_HEIGHT / 2);
  const holeWidth = useSharedValue(0);
  const holeHeight = useSharedValue(0);
  const opacity = useSharedValue(0);
  
  const pulseOpacity = useSharedValue(0.8);

  useEffect(() => {
    if (isActive && currentElementLayout) {
      opacity.value = withTiming(1, { duration: 250 });
      
      const targetX = currentElementLayout.x - PADDING;
      const targetY = currentElementLayout.y - PADDING;
      const targetWidth = currentElementLayout.width + PADDING * 2;
      const targetHeight = currentElementLayout.height + PADDING * 2;

      if (holeWidth.value === 0) {
        holeX.value = targetX;
        holeY.value = targetY;
        holeWidth.value = targetWidth;
        holeHeight.value = targetHeight;
      } else {
        const springConfig = { damping: 20, stiffness: 200, mass: 0.8 };
        holeX.value = withSpring(targetX, springConfig);
        holeY.value = withSpring(targetY, springConfig);
        holeWidth.value = withSpring(targetWidth, springConfig);
        holeHeight.value = withSpring(targetHeight, springConfig);
      }

      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ), -1, true
      );
    } else if (!isActive) {
      opacity.value = withTiming(0, { duration: 250 });
      setTimeout(() => { holeWidth.value = 0; }, 300);
    }
  }, [isActive, currentElementLayout]);

  const animatedPathProps = useAnimatedProps(() => {
    const x = holeX.value;
    const y = holeY.value;
    const w = holeWidth.value;
    const h = holeHeight.value;
    
    // Si no hay hueco, pintar todo
    if (w <= 0 || h <= 0) {
      return { d: `M 0 0 H ${SCREEN_WIDTH} V ${SCREEN_HEIGHT} H 0 Z` };
    }

    const minDim = Math.min(w, h);
    const r = Math.min(24, minDim / 2);

    // Contenedor exterior gigante (en sentido horario)
    // El rectángulo interior (en sentido horario también, pero fillRule='evenodd' creará el hueco de todas formas)
    const d = `
      M -500 -500 H ${SCREEN_WIDTH + 500} V ${SCREEN_HEIGHT + 500} H -500 Z
      M ${x + r} ${y}
      h ${w - 2 * r}
      a ${r} ${r} 0 0 1 ${r} ${r}
      v ${h - 2 * r}
      a ${r} ${r} 0 0 1 ${-r} ${r}
      h ${-(w - 2 * r)}
      a ${r} ${r} 0 0 1 ${-r} ${-r}
      v ${-(h - 2 * r)}
      a ${r} ${r} 0 0 1 ${r} ${-r}
      Z
    `;

    return { d };
  });

  const svgStyle = useAnimatedStyle(() => ({
    opacity: opacity.value
  }));

  const animatedPulseStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      left: holeX.value - 2,
      top: holeY.value - 2,
      width: holeWidth.value + 4,
      height: holeHeight.value + 4,
      borderWidth: 3,
      borderColor: theme.colors.primary,
      borderRadius: 26,
      opacity: pulseOpacity.value * opacity.value,
    };
  });

  const isTargetInTopHalf = currentElementLayout ? (currentElementLayout.y < SCREEN_HEIGHT / 2) : true;

  const animatedTooltipStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(opacity.value, [0, 1], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(opacity.value, [0, 1], [isTargetInTopHalf ? 20 : -20, 0], Extrapolation.CLAMP) }
      ]
    };
  });

  const [isRendered, setIsRendered] = React.useState(false);

  useEffect(() => {
    if (isActive) setIsRendered(true);
  }, [isActive]);

  const closeButtonStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    position: 'absolute',
    top: 50,
    right: 24,
    zIndex: 10
  }));

  if (!isRendered) return null;

  return (
    <AnimatedView style={[StyleSheet.absoluteFill, { zIndex: isActive ? 9999 : -1 }]} pointerEvents={isActive ? 'auto' : 'none'}>
      <AnimatedView style={[StyleSheet.absoluteFill, svgStyle]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <AnimatedPath
            animatedProps={animatedPathProps}
            fill="rgba(0,0,0,0.85)"
            fillRule="evenodd"
          />
        </Svg>
      </AnimatedView>
      
      {/* Marco brillante */}
      <AnimatedView style={animatedPulseStyle} pointerEvents="none" />

      {/* Botón de cerrar */}
      <AnimatedView style={closeButtonStyle}>
        <TouchableOpacity style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 20 }} onPress={stopTour}>
          <X size={20} color="#FFF" />
        </TouchableOpacity>
      </AnimatedView>

      {/* Contenedor Flex para la tarjeta */}
      <View 
        style={[
          StyleSheet.absoluteFill, 
          { 
            justifyContent: isTargetInTopHalf ? 'flex-end' : 'flex-start',
            paddingBottom: isTargetInTopHalf ? 60 : 0,
            paddingTop: !isTargetInTopHalf ? 110 : 0,
            paddingHorizontal: 20
          }
        ]} 
        pointerEvents="box-none"
      >
        {currentStepData && (
          <AnimatedView 
            style={[styles.tooltipCard, animatedTooltipStyle, { backgroundColor: theme.colors.primary }]}
          >
            
            {/* El pico de la flecha apuntando al botón */}
            <View style={[
              styles.triangle, 
              { borderBottomColor: theme.colors.primary },
              isTargetInTopHalf ? styles.triangleTop : styles.triangleBottom
            ]} />

            <View style={styles.header}>
               <View style={[styles.iconBox, { backgroundColor: theme.colors.onPrimary + '20' }]}>
                 {getIcon(currentStepData.iconName, theme.colors.onPrimary)}
               </View>
               <View style={[styles.stepIndicator, { backgroundColor: theme.colors.onPrimary + '20' }]}>
                 {globalProgress ? (
                   <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 4 }}>
                     {Array.from({ length: globalProgress.total }).map((_, i) => (
                       <View 
                         key={i} 
                         style={{ 
                           width: i === globalProgress.step - 1 ? 8 : 6, 
                           height: i === globalProgress.step - 1 ? 8 : 6, 
                           borderRadius: 4, 
                           backgroundColor: i === globalProgress.step - 1 ? theme.colors.onPrimary : theme.colors.onPrimary + '50' 
                         }} 
                       />
                     ))}
                   </View>
                 ) : (
                   <Text style={[styles.stepText, { color: theme.colors.onPrimary }]}>
                     {currentStepIndex + 1} DE {steps.length}
                   </Text>
                 )}
               </View>
            </View>

            <Text style={[styles.title, { color: theme.colors.onPrimary }]}>{currentStepData.title}</Text>
            <Text style={[styles.description, { color: theme.colors.onPrimary, opacity: 0.85 }]}>{currentStepData.description}</Text>

            <View style={styles.footer}>
              <TouchableOpacity onPress={stopTour} style={{ padding: 10 }}>
                 <Text style={{ color: theme.colors.onPrimary, opacity: 0.6, fontWeight: '700' }}>Omitir</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={nextStep} style={[styles.nextButton, { backgroundColor: theme.colors.onPrimary }]}>
                <Text style={{ color: theme.colors.primary, fontWeight: '900', marginRight: 4 }}>
                  {currentStepIndex === steps.length - 1 ? '¡Entendido!' : 'Siguiente'}
                </Text>
                {currentStepIndex !== steps.length - 1 && <ChevronRight size={18} color={theme.colors.primary} />}
              </TouchableOpacity>
            </View>
          </AnimatedView>
        )}
      </View>
    </AnimatedView>
  );
};

const styles = StyleSheet.create({
  tooltipCard: {
    padding: 24,
    borderRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    position: 'relative',
  },
  triangle: {
    position: 'absolute',
    left: '50%',
    marginLeft: -15,
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  triangleTop: {
    top: -15,
    transform: [{ rotate: '0deg' }],
  },
  triangleBottom: {
    bottom: -15,
    transform: [{ rotate: '180deg' }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  }
});
