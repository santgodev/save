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
import Svg, { Path, Rect } from 'react-native-svg';
import { useTour } from './TourContext';
import { useTheme } from '../../theme/ThemeContext';
import { ChevronRight, X, Sparkles, Zap, PlusCircle, PieChart, Clock, CreditCard, BarChart2, Unlock, ShoppingBag, CheckCircle, Trash2 } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

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
  const arrowBounce = useSharedValue(0);

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

      arrowBounce.value = withRepeat(
        withSequence(
          withTiming(-8, { duration: 350 }),
          withTiming(0, { duration: 350 })
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

  // Paneles invisibles que bloquean el toque en todo lo que NO es el hueco.
  // Antes, `allowTouches: true` ponía el contenedor entero en
  // pointerEvents="box-none", lo que dejaba pasar el toque a CUALQUIER
  // parte de la pantalla (otra pestaña, otro bolsillo, el chat) -- el
  // hueco oscuro del SVG es solo visual, nunca bloqueó nada. Estos 4
  // paneles (arriba/abajo/izq/der) rodean el hueco exacto y sí bloquean
  // -- el hueco en sí queda libre porque ningún panel lo cubre, así que
  // el elemento real de abajo sigue recibiendo el toque normalmente.
  const topPanelStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: SCREEN_WIDTH,
    height: Math.max(0, holeY.value),
    backgroundColor: 'transparent',
  }));

  const bottomPanelStyle = useAnimatedStyle(() => {
    const top = holeY.value + holeHeight.value;
    return {
      position: 'absolute',
      left: 0,
      top,
      width: SCREEN_WIDTH,
      height: Math.max(0, SCREEN_HEIGHT - top),
      backgroundColor: 'transparent',
    };
  });

  const leftPanelStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: holeY.value,
    width: Math.max(0, holeX.value),
    height: Math.max(0, holeHeight.value),
    backgroundColor: 'transparent',
  }));

  const rightPanelStyle = useAnimatedStyle(() => {
    const left = holeX.value + holeWidth.value;
    return {
      position: 'absolute',
      left,
      top: holeY.value,
      width: Math.max(0, SCREEN_WIDTH - left),
      height: Math.max(0, holeHeight.value),
      backgroundColor: 'transparent',
    };
  });

  // Props animadas para el rectángulo de borde SVG (reemplaza el AnimatedView
  // que tenía backgroundColor blanco en iOS por defecto de Reanimated).
  // Con SVG fill="none" + stroke no hay ningún interior que pintar.
  const animatedRectProps = useAnimatedProps(() => {
    const minDim = Math.min(holeWidth.value, holeHeight.value);
    const r = Math.min(24, minDim / 2);
    return {
      x: holeX.value - 2,
      y: holeY.value - 2,
      width: holeWidth.value + 4,
      height: holeHeight.value + 4,
      rx: r,
      ry: r,
      opacity: holeWidth.value > 0 ? pulseOpacity.value * opacity.value : 0,
    };
  });

  // Se "bloquea" la primera medición de cada paso y no se vuelve a
  // recalcular hasta que cambie de paso. Sin esto, cada nueva medición del
  // polling de TourStep (hasta 10 veces en 1.5s, mientras la pantalla
  // sigue acomodándose por el teclado u otra animación) podía cruzar el
  // punto medio de la pantalla y hacer que la tarjeta cambiara de "entra
  // desde arriba" a "entra desde abajo" a mitad de la animación -- se veía
  // como si lo intentara dos veces. Ahora la dirección se decide una sola
  // vez por paso; después solo se permite un ajuste suave de posición
  // (spring), nunca un cambio de lado.
  const [lockedTopHalf, setLockedTopHalf] = React.useState(true);
  const lockedStepNameRef = React.useRef<string | null>(null);
  const hasLockedForStepRef = React.useRef(false);

  useEffect(() => {
    const stepName = currentStepData?.name ?? null;
    if (stepName !== lockedStepNameRef.current) {
      lockedStepNameRef.current = stepName;
      hasLockedForStepRef.current = false;
    }
    if (!hasLockedForStepRef.current && currentElementLayout) {
      hasLockedForStepRef.current = true;
      setLockedTopHalf(currentElementLayout.y < SCREEN_HEIGHT / 2);
    }
  }, [currentStepData?.name, currentElementLayout]);

  const isTargetInTopHalf = lockedTopHalf;

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

  const arrowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: arrowBounce.value }],
    opacity: opacity.value,
  }));

  if (!isRendered) return null;

  return (
    <AnimatedView style={[StyleSheet.absoluteFill, { zIndex: isActive ? 9999 : -1 }]} pointerEvents={isActive ? (currentStepData?.allowTouches ? 'box-none' : 'auto') : 'none'}>
      <AnimatedView style={[StyleSheet.absoluteFill, svgStyle]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <AnimatedPath
            animatedProps={animatedPathProps}
            fill="rgba(0,0,0,0.85)"
            fillRule="evenodd"
          />
          {/* Borde SVG: fill=none garantiza que el interior sea 100% transparente */}
          <AnimatedRect
            animatedProps={animatedRectProps}
            fill="none"
            stroke={theme.colors.primary}
            strokeWidth={3}
          />
        </Svg>
      </AnimatedView>

      {/* Bloqueo real del toque fuera del hueco -- solo aplica cuando el
          paso deja pasar el toque (allowTouches) y ya sabemos dónde está
          el hueco. Sin esto, allowTouches dejaba tocar TODA la pantalla. */}
      {currentStepData?.allowTouches && currentElementLayout && (
        <>
          <AnimatedView pointerEvents="auto" style={topPanelStyle} />
          <AnimatedView pointerEvents="auto" style={bottomPanelStyle} />
          <AnimatedView pointerEvents="auto" style={leftPanelStyle} />
          <AnimatedView pointerEvents="auto" style={rightPanelStyle} />
        </>
      )}

      {currentStepData?.onTargetClick && currentElementLayout && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            left: currentElementLayout.x - 4,
            top: currentElementLayout.y - 4,
            width: currentElementLayout.width + 8,
            height: currentElementLayout.height + 8,
            zIndex: 100,
          }}
          onPress={() => currentStepData.onTargetClick!()}
        />
      )}
      

      {/* Flecha animada apuntando al elemento iluminado */}
      {currentStepData?.showArrow && currentElementLayout && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              alignItems: 'center',
              left: currentElementLayout.x + currentElementLayout.width / 2 - 16,
              top: isTargetInTopHalf
                ? currentElementLayout.y - 44   // apunta arriba
                : currentElementLayout.y - 48,  // apunta abajo
            },
            arrowAnimatedStyle,
          ]}
        >
          <Text style={{ fontSize: 28, color: theme.colors.primary }}>
            {isTargetInTopHalf ? '↑' : '↓'}
          </Text>
        </Animated.View>
      )}

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
          <Animated.View 
            style={[styles.tooltipCard, animatedTooltipStyle, { backgroundColor: theme.colors.primary }]}
          >
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
            {typeof currentStepData.description === 'string' ? (
              <Text style={[styles.description, { color: theme.colors.onPrimary, opacity: 0.85 }]}>{currentStepData.description}</Text>
            ) : (
              // Sin opacity forzado acá: un ReactNode custom (como el de
              // AddIncome resaltando "$" y "%") necesita poder decidir su
              // propio contraste por tramo de texto. El opacity de un
              // padre se combina con el de cualquier hijo -- si lo
              // dejábamos en 0.85 aquí, ningún hijo podía verse más
              // brillante que el resto aunque pusiera su propio color a
              // opacidad completa.
              <View style={styles.description}>
                {currentStepData.description}
              </View>
            )}

            <View style={styles.footer}>
              <TouchableOpacity onPress={stopTour} style={{ padding: 10 }}>
                 <Text style={{ color: theme.colors.onPrimary, opacity: 0.6, fontWeight: '700' }}>Omitir</Text>
              </TouchableOpacity>

              {!currentStepData.hideNextButton && (
                <TouchableOpacity onPress={nextStep} style={[styles.nextButton, { backgroundColor: theme.colors.surface }]}>
                  <Text style={[styles.nextButtonText, { color: theme.colors.primary }]}>
                    {currentStepData.nextButtonText 
                      ? currentStepData.nextButtonText 
                      : (currentStepIndex === steps.length - 1 ? 'Entendido' : 'Siguiente')}
                  </Text>
                  {currentStepIndex !== steps.length - 1 && <ChevronRight size={18} color={theme.colors.primary} />}
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
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
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '800',
    marginRight: 6
  }
});
