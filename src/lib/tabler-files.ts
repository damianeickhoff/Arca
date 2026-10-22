// The import of one Tabler icon file. Turbopack turns the template literal into a
// lookup table of every icon (~6,000 entries, ~200 KB gzipped), so this module is itself
// only loaded through a dynamic import (components/tabler-glyph.tsx): the table stays
// out of the page bundle and arrives with the first icon. The literal "Icon" prefix
// keeps the folder's index.mjs (the whole set in one file) out of the build.
export function importTablerFile(name: string): Promise<{ default: unknown }> {
  return import(`@tabler/icons-react/dist/esm/icons/Icon${name}.mjs`);
}
