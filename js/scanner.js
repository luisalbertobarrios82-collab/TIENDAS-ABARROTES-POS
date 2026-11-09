// Lectura de códigos con la cámara. Usa BarcodeDetector si el navegador lo trae;
// si no (iPhone, Chrome de escritorio), carga la copia local de ZXing.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/zxing.min.js';
    script.onload = () => resolve(window.ZXing);
    script.onerror = () => reject(new Error('No se pudo cargar el lector de códigos.'));
    document.head.append(script);
  });
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  const supported = await window.BarcodeDetector.getSupportedFormats();
  const formats = FORMATS.filter((f) => supported.includes(f));
  return formats.length ? new window.BarcodeDetector({ formats }) : null;
}

// Empieza a leer y llama onCode(texto). Devuelve { stop, torch }; torch es null si no hay linterna.
export async function startScanner(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  let stopped = false;
  let stopReader = () => {};

  try {
    const detector = await nativeDetector();
    if (detector) {
      video.srcObject = stream;
      await video.play();
      const loop = async () => {
        if (stopped) return;
        try {
          const [found] = await detector.detect(video);
          if (found?.rawValue) onCode(found.rawValue);
        } catch { /* cuadro no disponible: se reintenta */ }
        setTimeout(loop, 120);
      };
      loop();
    } else {
      const ZXing = await loadZXing();
      const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.ITF,
      ]]]);
      const reader = new ZXing.BrowserMultiFormatReader(hints, 150);
      reader.decodeFromStream(stream, video, (result) => {
        if (result && !stopped) onCode(result.getText());
      });
      stopReader = () => reader.reset();
    }
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }

  const [track] = stream.getVideoTracks();
  const hasTorch = Boolean(track.getCapabilities?.().torch);
  let torchOn = false;

  return {
    stop() {
      stopped = true;
      stopReader();
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
    torch: hasTorch ? async () => {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      return torchOn;
    } : null,
  };
}
