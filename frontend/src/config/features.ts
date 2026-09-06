const enabled = (value?: string) => value?.trim().toLowerCase() === 'true';

export const AUTH_FEATURES = {
  whatsapp: enabled(process.env.EXPO_PUBLIC_WHATSAPP_AUTH_ENABLED),
  google: enabled(process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED),
  googleAuthUrl: process.env.EXPO_PUBLIC_GOOGLE_AUTH_URL?.trim() || '',
};

