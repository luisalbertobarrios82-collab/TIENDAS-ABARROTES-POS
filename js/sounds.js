// Sonidos generados en el momento: no usan archivos de audio.
let context = null;

function getContext() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return null;
  context ||= new AudioEngine();
  if (context.state !== 'running') context.resume().catch(() => {});
  return context;
}

// Los navegadores solo permiten sonido después de que la persona toca la pantalla.
for (const type of ['pointerdown', 'touchend', 'keydown']) {
  document.addEventListener(type, getContext, { capture: true, passive: true });
}

function tone(audio, { frequency, delay = 0, duration, volume, wave = 'sine' }) {
  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

// Un pitido corto, como el de un lector de caja.
export function playScan() {
  const audio = getContext();
  if (audio) tone(audio, { frequency: 1975, duration: 0.09, volume: 0.22, wave: 'triangle' });
}

// Timbre de dos notas ascendentes con un brillo suave.
export function playPaid() {
  const audio = getContext();
  if (!audio) return;
  for (const [frequency, delay] of [[1046.5, 0], [1568, 0.11]]) {
    tone(audio, { frequency, delay, duration: 0.55, volume: 0.28 });
    tone(audio, { frequency: frequency * 2, delay, duration: 0.3, volume: 0.07 });
  }
}
