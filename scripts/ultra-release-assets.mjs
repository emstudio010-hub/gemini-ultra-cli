import path from 'node:path';
import { chmod, cp, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Only product documentation belongs in the installed CLI. Development reports,
// goal ledgers and local reference notes stay in the source checkout.
const documentationFiles = new Set([
  'index.md',
  'sidebar.json',
  'redirects.json',
  'ultra-install.md',
]);
const documentationDirectories = new Set([
  'admin',
  'assets',
  'cli',
  'core',
  'examples',
  'extensions',
  'get-started',
  'hooks',
  'ide-integration',
  'reference',
  'resources',
  'tools',
]);

export function isReleaseDocumentation(relativePath) {
  const segments = relativePath.split(/[\\/]/);
  if (segments.some((segment) => segment === '..' || segment.startsWith('.')))
    return false;
  return (
    documentationFiles.has(relativePath) ||
    documentationDirectories.has(segments[0])
  );
}

export function documentationFilter(sourceRoot) {
  return (file) => {
    const relative = path.relative(sourceRoot, file);
    return relative === '' || isReleaseDocumentation(relative);
  };
}

// Keep all supported binaries in each archive so moving an installation archive
// between systems does not silently remove the fast search implementation.
export async function copyRipgrepAssets(sourceRoot, destinationRoot) {
  const manifest = JSON.parse(
    await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'),
  );
  const expected = new Set([
    'rg-darwin-arm64',
    'rg-darwin-x64',
    'rg-linux-arm64',
    'rg-linux-x64',
    'rg-win32-arm64.exe',
    'rg-win32-x64.exe',
  ]);
  if (manifest.binaries?.length !== expected.size)
    throw new Error('Incomplete ripgrep release manifest');
  await mkdir(destinationRoot, { recursive: true });
  for (const binary of manifest.binaries) {
    if (!expected.delete(binary.file))
      throw new Error(`Unexpected ripgrep asset: ${binary.file}`);
    const source = path.join(sourceRoot, binary.file);
    const hash = createHash('sha256')
      .update(await readFile(source))
      .digest('hex');
    if (hash !== binary.sha256)
      throw new Error(`Ripgrep checksum mismatch: ${binary.file}`);
    const destination = path.join(destinationRoot, binary.file);
    await cp(source, destination);
    await chmod(destination, 0o755);
  }
  for (const file of ['manifest.json', 'COPYING', 'LICENSE-MIT', 'UNLICENSE'])
    await cp(path.join(sourceRoot, file), path.join(destinationRoot, file));
  return manifest;
}
