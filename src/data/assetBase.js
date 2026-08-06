// Vite replaces `import.meta.env.BASE_URL` at build time, but `import.meta.env`
// is per-module and simply absent outside a Vite pipeline - so reading it
// directly threw in the unit runner and would have produced "undefinedassets/..."
// URLs anywhere the define was missing. One guarded resolver keeps the asset
// manifests loadable by both the bundler and node --test.
export function assetBase() {
  try {
    return import.meta.env.BASE_URL ?? '/';
  } catch {
    return '/';
  }
}

/** Absolute URL for a file under public/assets. */
export function assetUrl(path) {
  return `${assetBase()}assets/${path}`;
}
