/** Download a caller-validated Blob. This helper never fetches or accepts a remote URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (!filename || filename.length > 180 || /[\x00-\x1f\x7f/\\]/.test(filename) || /^\.+$/.test(filename))
    throw new Error('Invalid download filename.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to consume the URL before releasing its backing memory.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
