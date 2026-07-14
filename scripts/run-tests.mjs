import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const outputDirectory = path.join(root, '.test-dist');
rmSync(outputDirectory, { recursive: true, force: true });

const tscPath = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(process.execPath, [tscPath, '-p', 'tsconfig.test.json'], {
  cwd: root,
  stdio: 'inherit',
});

await import(pathToFileURL(path.join(outputDirectory, 'tests', 'doorways.test.js')).href);
await import(pathToFileURL(path.join(outputDirectory, 'tests', 'layoutFile.test.js')).href);
await import(pathToFileURL(path.join(outputDirectory, 'tests', 'groupTransform.test.js')).href);
await import(pathToFileURL(path.join(outputDirectory, 'tests', 'color.test.js')).href);
