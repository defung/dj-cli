const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/bundled/bundle.js',
  platform: 'node',
  target: 'esnext',
  format: 'cjs',
  sourcemap: true,
  minify: true,
}).catch(() => process.exit(1));
