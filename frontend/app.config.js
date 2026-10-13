module.exports = ({ config }) => {
  const qa = process.env.MOLI_BUILD_VARIANT === 'qa';
  return {
    ...config,
    name: qa ? 'Moli QA' : config.name,
    android: {
      ...config.android,
      package: qa ? 'com.digigo.app.qa' : config.android.package,
      ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
    },
    plugins: [...(config.plugins || []), 'expo-notifications'],
    extra: {
      ...config.extra,
      ...(process.env.EAS_PROJECT_ID ? { eas: { ...config.extra?.eas, projectId: process.env.EAS_PROJECT_ID } } : {}),
    },
  };
};
