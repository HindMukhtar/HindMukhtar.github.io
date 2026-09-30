import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
await fs.mkdir('src/rag/vendor', {recursive: true});
await build({
  entryPoints: {chat: 'src/js/rag/chat.mjs', worker: 'src/js/rag/worker.mjs'},
  outdir: 'src/rag/app', bundle: true, splitting: true, format: 'esm', platform: 'browser',
  target: 'es2022', minify: true, sourcemap: false, logLevel: 'info'
});
for (const file of await fs.readdir('node_modules/onnxruntime-web/dist')) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(file)) await fs.copyFile('node_modules/onnxruntime-web/dist/' + file, 'src/rag/vendor/' + file);
}
