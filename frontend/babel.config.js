/* Los alias de ruta (estándar 33) los resuelve module-resolver tanto en Metro como en Jest. */
module.exports = function (api) {
  /* En Jest los alias los resuelve moduleNameMapper (package.json): module-resolver
     calcula rutas relativas que se rompen sobre la unidad de red (UNC). */
  const enPruebas = api.env('test')
  return {
    presets: [require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] })],
    plugins: enPruebas
      ? []
      : [
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.js', '.json'],
          alias: {
            '@componentes': './src/components',
            '@servicios': './src/services',
            '@pantallas': './src/screens',
            '@tema': './src/theme',
            '@hooks': './src/hooks',
            '@utils': './src/utils',
            '@contextos': './src/contexts',
            '@tipos': './src/types',
            '@logica': './src/logica',
            '@config': './src/config',
            '@validaciones': './src/validaciones',
            '@navegacion': './src/navigation',
          },
        },
      ],
    ],
  }
}
