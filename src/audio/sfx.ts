// Procedural WebAudio sound effects. No files. No emojis. Pure synth.

import * as THREE from "three";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.7;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function setVolume(v: number): void {
  volume = v;
  if (master) master.gain.value = v;
}

export function getVolume(): number {
  return volume;
}

export function resumeAudio(): void {
  const a = ac();
  if (a.state === "suspended") a.resume();
}

function noiseBuf(a: AudioContext, dur: number): AudioBuffer {
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function playNoise(dur: number, freq: number, q: number, gain: number,
                   type: BiquadFilterType = "bandpass", decay = dur): void {
  const a = ac();
  const src = a.createBufferSource();
  src.buffer = noiseBuf(a, dur);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + decay);
  src.connect(f).connect(g).connect(master!);
  src.start();
  src.stop(a.currentTime + dur);
}

function playTone(freq: number, dur: number, gain: number, type: OscillatorType = "square",
                  slideTo?: number): void {
  const a = ac();
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g).connect(master!);
  o.start();
  o.stop(a.currentTime + dur);
}

const STEP_PITCH: Record<string, number> = {
  grass: 500, dirt: 420, sand: 700, stone: 900, wood: 600, snow: 800,
};

export function sfxStep(mat: string): void {
  playNoise(0.09, STEP_PITCH[mat] || 600, 1.2, 0.25, "bandpass", 0.07);
}

export function sfxDig(mat: string): void {
  playNoise(0.1, (STEP_PITCH[mat] || 600) * 0.8, 1.0, 0.3, "lowpass", 0.09);
}

export function sfxBreak(mat: string): void {
  playNoise(0.25, (STEP_PITCH[mat] || 500) * 0.6, 0.8, 0.5, "lowpass", 0.2);
  playTone(90, 0.12, 0.1, "triangle", 50);
}

export function sfxPlace(mat: string): void {
  playNoise(0.12, (STEP_PITCH[mat] || 600) * 1.1, 1.5, 0.35, "bandpass", 0.1);
}

export function sfxHurt(): void {
  playTone(220, 0.18, 0.3, "square", 110);
}

export function sfxHurtMob(kind: string): void {
  switch (kind) {
    case "zombie": playTone(140, 0.3, 0.25, "sawtooth", 70); break;
    case "skeleton": playNoise(0.15, 1800, 3, 0.3, "bandpass", 0.12); break;
    case "creeper": playTone(180, 0.2, 0.2, "triangle", 120); break;
    case "spider": playNoise(0.18, 2500, 4, 0.25, "highpass", 0.15); break;
    case "pig": playTone(300, 0.2, 0.25, "square", 200); break;
    case "cow": playTone(180, 0.4, 0.25, "sawtooth", 120); break;
    case "sheep": playTone(260, 0.3, 0.22, "square", 180); break;
    case "chicken": playTone(600, 0.12, 0.2, "square", 400); break;
  }
}

export function sfxGroan(kind: string): void {
  switch (kind) {
    case "zombie": playTone(100 + Math.random() * 40, 0.7, 0.12, "sawtooth", 60); break;
    case "skeleton": playNoise(0.3, 2200, 6, 0.08, "bandpass", 0.28); break;
    case "spider": playNoise(0.35, 1800, 5, 0.08, "highpass", 0.3); break;
    case "pig": playTone(280, 0.15, 0.1, "square", 220); break;
    case "cow": playTone(160, 0.5, 0.1, "sawtooth", 110); break;
    case "sheep": playTone(240, 0.35, 0.1, "square", 170); break;
    case "chicken": playTone(700, 0.08, 0.08, "square", 500); break;
  }
}

export function sfxHiss(): void {
  playNoise(1.5, 3000, 0.5, 0.4, "highpass", 1.5);
}

export function sfxFusePop(): void {
  playNoise(0.08, 3500, 1, 0.4, "highpass", 0.06);
}

export function sfxExplode(): void {
  playNoise(1.0, 180, 0.4, 0.9, "lowpass", 0.9);
  playNoise(0.5, 90, 0.3, 1.0, "lowpass", 0.45);
  playTone(60, 0.5, 0.5, "triangle", 30);
}

export function sfxBow(): void {
  playNoise(0.1, 900, 3, 0.3, "bandpass", 0.08);
  playTone(350, 0.08, 0.1, "triangle", 180);
}

export function sfxArrowHit(): void {
  playNoise(0.08, 1200, 2, 0.3, "bandpass", 0.06);
}

export function sfxSplash(): void {
  playNoise(0.3, 600, 1, 0.3, "lowpass", 0.25);
}

export function sfxEat(): void {
  playNoise(0.1, 300, 1, 0.3, "lowpass", 0.08);
  playNoise(0.1, 250, 1, 0.25, "lowpass", 0.08);
}

export function sfxClick(): void {
  playTone(800, 0.04, 0.1, "square", 600);
}

export function sfxBoomDistant(): void {
  playNoise(0.8, 120, 0.5, 0.5, "lowpass", 0.7);
}

export function sfxAnnoy(): void {
  // intentionally unused placeholder kept silent
}
