import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Receipt, Utensils, Home, DollarSign, ArrowRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

interface IntroTourProps {
  onComplete: () => void;
  userName?: string;
}

export function IntroTour({ onComplete, userName = 'Usuario' }: IntroTourProps) {
  const { theme } = useTheme();
  const pastel = (theme.colors as any).pastel ?? {};

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem('@save_intro_tour_completed', 'true');
    } catch (e) {
      console.error('Error saving intro tour state', e);
    }
    onComplete();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>

      {/* HEADER */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, position: 'relative' }}>
        <View style={{ flexDirection: 'row' }}>
          {[
            { char: 'S', color: theme.colors.primary },
            { char: 'A', color: pastel.salmon || theme.colors.secondary },
            { char: 'V', color: pastel.teal || theme.colors.tertiary },
            { char: 'E', color: pastel.lavender || theme.colors.error },
          ].map(({ char, color }) => (
            <Text key={char} style={{ fontSize: 22, fontWeight: '900', fontFamily: theme.fonts.headline, letterSpacing: -1, color }}>
              {char}
            </Text>
          ))}
        </View>
        {__DEV__ && (
          <TouchableOpacity style={{ position: 'absolute', right: 20 }} onPress={onComplete}>
            <Text style={{ color: theme.colors.error, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>DEV: SALIR</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* GREETING */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.onBackground, letterSpacing: -0.5, fontFamily: theme.fonts.headline, marginBottom: 6 }}>
            Hola, {userName.split(' ')[0]}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
            Mira cómo Save organiza tu plata.
          </Text>
        </View>

        {/* MAIN CARD */}
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 32, padding: 20, paddingVertical: 28, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.divider }}>

          {/* PASO 1 */}
          <View style={{ alignItems: 'center', marginBottom: 6, width: '100%' }}>
            <View style={{ backgroundColor: pastel.teal + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: pastel.teal, letterSpacing: 1 }}>PASO 1</Text>
            </View>
            <View style={{ width: 64, height: 64, borderRadius: 24, backgroundColor: pastel.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Receipt size={28} color="#FFF" strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onSurface, marginBottom: 4 }}>Escanea tu factura</Text>
            <Text style={{ fontSize: 13, fontWeight: '500', color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
              La IA detecta el gasto y lo clasifica solo
            </Text>
          </View>

          <View style={{ width: 1.5, height: 20, backgroundColor: theme.colors.divider, marginVertical: 8 }} />

          {/* PASO 2 */}
          <View style={{ alignItems: 'center', marginBottom: 6, width: '100%' }}>
            <View style={{ backgroundColor: pastel.salmon + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: pastel.salmon, letterSpacing: 1 }}>PASO 2</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 24, backgroundColor: pastel.salmon, alignItems: 'center', justifyContent: 'center' }}>
                <Home size={28} color="#FFF" strokeWidth={2} />
              </View>
              <View style={{ width: 64, height: 64, borderRadius: 24, backgroundColor: pastel.teal, alignItems: 'center', justifyContent: 'center' }}>
                <Utensils size={28} color="#FFF" strokeWidth={2} />
              </View>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onSurface, marginBottom: 4 }}>Tus bolsillos</Text>
            <Text style={{ fontSize: 13, fontWeight: '500', color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
              Cada gasto sale del bolsillo correcto automáticamente
            </Text>
          </View>

          <View style={{ width: 1.5, height: 20, backgroundColor: theme.colors.divider, marginVertical: 8 }} />

          {/* PASO 3 */}
          <View style={{ alignItems: 'center', marginBottom: 24, width: '100%' }}>
            <View style={{ backgroundColor: pastel.lavender + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: pastel.lavender, letterSpacing: 1 }}>PASO 3</Text>
            </View>
            <View style={{ width: 64, height: 64, borderRadius: 24, backgroundColor: pastel.lavender, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <DollarSign size={28} color="#FFF" strokeWidth={2.5} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.onSurface, marginBottom: 4 }}>Tu total a fin de mes</Text>
            <Text style={{ fontSize: 13, fontWeight: '500', color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
              Siempre sabes cuánto te queda disponible
            </Text>
          </View>

          {/* CTA Button */}
          <TouchableOpacity onPress={handleComplete} activeOpacity={0.85} style={{ width: '100%', height: 52, borderRadius: 20, overflow: 'hidden' }}>
            <LinearGradient
              colors={[pastel.teal || theme.colors.primary, pastel.lavender || theme.colors.secondary]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF' }}>Empezar a organizar</Text>
              <ArrowRight size={18} color="#FFF" strokeWidth={2.5} />
            </LinearGradient>
          </TouchableOpacity>

        </View>

      </ScrollView>

    </SafeAreaView>
  );
}