import path from 'node:path';

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
