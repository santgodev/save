import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, TextInput, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { theme } from '../theme/theme';
import { LucideIcon } from 'lucide-react-native';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  icon: LucideIcon;
  iconColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
  requireInputToConfirm?: string;
}

export const ConfirmModal = ({
  visible,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  icon: Icon,
  iconColor,
  onConfirm,
  onCancel,
  isDestructive = false,
  requireInputToConfirm
}: ConfirmModalProps) => {
  const [inputValue, setInputValue] = useState('');

  if (!visible) return null;

  const isConfirmEnabled = !requireInputToConfirm || inputValue === requireInputToConfirm;
  const confirmColor = isDestructive ? theme.colors.error : theme.colors.primary;
  const finalIconColor = iconColor || (isDestructive ? theme.colors.error : theme.colors.primary);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={() => {
        setInputValue('');
        onCancel();
      }}
    >
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={() => {
          Keyboard.dismiss();
          setInputValue('');
          onCancel();
        }} />
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalContainer}>
            <View style={[styles.iconContainer, { backgroundColor: isDestructive ? theme.colors.errorContainer : theme.colors.surfaceContainerHighest }]}>
              <Icon size={32} color={finalIconColor} strokeWidth={2.5} />
            </View>
          
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          
            {requireInputToConfirm && (
              <TextInput
                style={styles.input}
                placeholder={`Escribe "${requireInputToConfirm}"`}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={inputValue}
                onChangeText={setInputValue}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            )}
          
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={() => {
                setInputValue('');
                onCancel();
              }} 
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
            
              <TouchableOpacity 
                style={[styles.confirmButton, { backgroundColor: confirmColor, opacity: isConfirmEnabled ? 1 : 0.4 }]} 
                onPress={() => {
                  if (isConfirmEnabled) {
                    Keyboard.dismiss();
                    setInputValue('');
                    onConfirm();
                  }
                }} 
                disabled={!isConfirmEnabled}
                activeOpacity={0.7}
              >
                <Text style={[styles.confirmText, { color: isDestructive ? theme.colors.onError : theme.colors.onPrimary }]}>
                  {confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Outfit-Bold',
    color: theme.colors.onSurface,
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  input: {
    width: '100%',
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    fontSize: 16,
    color: theme.colors.onSurface,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.onSurfaceVariant,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '800',
  }
});
