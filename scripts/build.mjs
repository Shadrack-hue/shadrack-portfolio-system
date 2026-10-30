import { mkdir, rm, cp } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'contact.html', 'thanks.html', 'intelstream.html', 'speed-insights.js', 'assets']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
console.log('Built public pages and assets. Server code and test files excluded.');
