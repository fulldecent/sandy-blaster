export function showError(error) {
  console.error(error);
  alert(error instanceof Error ? error.message : String(error));
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Chrome drops the download if this URL is revoked in the same turn as click().
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// The save picker has to be the first wait in the click. Building a large
// report from IndexedDB takes longer than a click stays valid, and the
// download is then discarded. Cancel returns without saving. A blocked
// picker falls through to downloadBlob.
export async function saveFromClick(filename, accept, produceBlob) {
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ accept }],
      });
      const blob = await produceBlob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
      if (!err || (err.name !== "SecurityError" && err.name !== "NotAllowedError")) throw err;
    }
  }
  downloadBlob(await produceBlob(), filename);
}
