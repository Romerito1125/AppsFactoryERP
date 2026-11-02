import { apiClient } from "@/lib/api-client";

// Soportes (imagen o PDF) de recibos y abonos. Máximo ~3 MB en el navegador;
// el API acepta hasta ~4 MB en base64.
export const MAX_SUPPORT_BYTES = 3 * 1024 * 1024;

export function readSupportFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!/^(image\/|application\/pdf)/i.test(file.type)) {
      return reject(new Error("El soporte debe ser una imagen o un PDF."));
    }
    if (file.size > MAX_SUPPORT_BYTES) {
      return reject(new Error("El soporte no puede superar 3 MB."));
    }
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        supportName: file.name,
        supportMimeType: file.type,
        supportData: String(reader.result ?? ""),
      });
    reader.onerror = () => reject(new Error("No se pudo leer el soporte."));
    reader.readAsDataURL(file);
  });
}

export async function openSupportData(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function viewReceiptSupport(receiptId) {
  const full = await apiClient.get(`/recibos/${receiptId}`);
  if (!full.supportData) throw new Error("El recibo no tiene soporte adjunto.");
  await openSupportData(full.supportData);
}
