import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
for (const directory of ['src','netlify/functions']) {
  for (const name of await readdir(directory)) if (name.endsWith('.mjs')) {
    const check = spawnSync(process.execPath,['--check',directory+'/'+name],{ stdio: 'inherit' });
    if (check.status) process.exit(check.status);
  }
}
console.log('Function sources syntax checked. This is not a Netlify deployment validation.');
