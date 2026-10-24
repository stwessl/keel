let audio = null;

// Browsers only allow audio after a user gesture, so this runs on Start and on clicks.
export function unlockSound() {
  if (!audio) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audio = new Context({ latencyHint: "interactive" });
  }
  if (audio.state === "suspended") audio.resume();
}

function tone({ type = "sine", from, to = from, duration, volume, delay = 0 }) {
  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise({ duration, volume, frequency }) {
  const start = audio.currentTime;
  const length = Math.ceil(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(start);
}

function ready() {
  return audio && audio.state === "running";
}

export function playHit() {
  if (!ready()) return;
  tone({ type: "triangle", from: 1500, to: 1900, duration: 0.09, volume: 0.22 });
  tone({ from: 2850, duration: 0.07, volume: 0.07, delay: 0.012 });
}

export function playMiss() {
  if (!ready()) return;
  tone({ from: 190, to: 85, duration: 0.14, volume: 0.28 });
  noise({ duration: 0.08, volume: 0.12, frequency: 700 });
}

export function playTick() {
  if (!ready()) return;
  tone({ from: 950, duration: 0.035, volume: 0.08 });
}
