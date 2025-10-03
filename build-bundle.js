const esbuild = require('esbuild');

const runBundle = async () => {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'dist/bundled/bundle.js',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    sourcemap: true,
    minify: false,
    inject: [ './package.json'],
    banner: { js: "#!/usr/bin/env node" },
    external: ['better-sqlite3', '@actual-app/api'],
  });
};

runBundle().catch(() => process.exit(1));
