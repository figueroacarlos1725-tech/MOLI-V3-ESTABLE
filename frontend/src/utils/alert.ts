import { Alert, Platform } from 'react-native';

export function confirmAlert(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText: string = 'Confirmar',
  cancelText: string = 'Cancelar'
) {
  if (Platform.OS === 'web') {
    const result = window.confirm(`${title}\n\n${message}`);
    if (result) {
      onConfirm();
    }
  } else {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel' },
        { text: confirmText, style: 'destructive', onPress: onConfirm },
      ]
    );
  }
}
