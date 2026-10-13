module.exports = ({ config }) => {
  const qa = process.env.MOLI_BUILD_VARIANT === 'qa';
  return {
    ...config,
    name: qa ? 'Moli QA' : config.name,
    ...(qa ? { slug: 'molitech', owner: 'carlosfigueroa0725s-team' } : {}),
    android: {
      ...config.android,
      package: qa ? 'com.digigo.app.qa' : config.android.package,
      ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
    },
    plugins: [...(config.plugins || []), 'expo-notifications'],
    extra: {
      ...config.extra,
      ...(qa || process.env.EAS_PROJECT_ID ? { eas: { ...config.extra?.eas, projectId: process.env.EAS_PROJECT_ID || 'afd91687-757f-4a51-b7b8-13a81755fb1c' } } : {}),
    },
  };
};
