/**
 * Modern AI Duet Entry Point (Vite / ES Modules).
 */

import '../style/main.scss';

import { Keyboard } from './keyboard/Keyboard.js';
import { Sound } from './sound/Sound.js';
import { AI } from './ai/AI.js';
import { Glow } from './interface/Glow.js';
import { Splash } from './interface/Splash.js';
import { About } from './interface/About.js';
import { Controls } from './interface/Controls.js';
import { Tutorial } from './ai/Tutorial.js';
import { Roll } from './roll/Roll.js';

// Initialize container
const container = document.querySelector('#container') || document.body;

// 1. Audio and Core Systems
const sound = new Sound();
const keyboard = new Keyboard(container);
const ai = new AI();
const glow = new Glow(container);

// Connect 3D Roll to DOM
Roll.appendTo(container);

// 2. Tutorial and UI Overlay
const tutorial = new Tutorial(container);
const splash = new Splash(document.body);
const about = new About(document.body);
const controls = new Controls(document.body, ai, sound, tutorial);

splash.on('click', async () => {
  await sound.resume();
  keyboard.activate();
  tutorial.start();
  about.showButton();
  controls.show();
});

splash.on('about', () => {
  about.open();
});

// Sync Sound Loading Progress
sound.on('progress', (p) => {
  splash.loader.progress(p);
});

sound.on('load', () => {
  splash.loader.loaded();
});

// Window focus/blur management
window.addEventListener('blur', () => keyboard.deactivate());
window.addEventListener('focus', () => {
  if (!splash.isOpen()) {
    keyboard.activate();
  }
});

// 3. User Playing Piano
keyboard.on('keyDown', (note) => {
  tutorial.dismiss();
  sound.keyDown(note);
  ai.keyDown(note);
  glow.user();
  controls.onUserKeyDown(note);
});

keyboard.on('keyUp', (note) => {
  sound.keyUp(note);
  ai.keyUp(note);
  glow.user();
  controls.onUserKeyUp(note);
});

// 4. AI Duet Response
ai.on('playNote', (note, time, duration) => {
  sound.playNote(note, time, duration, true, 0.7);
  controls.onAiPlayNote(note, time, duration);
});

ai.on('keyDown', (note, time) => {
  keyboard.keyDown(note, time, true);
  glow.ai(time);
});

ai.on('keyUp', (note, time) => {
  keyboard.keyUp(note, time, true);
  glow.ai(time);
});

// 5. Interactive Tutorial
tutorial.on('keyDown', (note, time) => {
  sound.keyDown(note, time);
  keyboard.keyDown(note, time);
  glow.user();
  controls.onUserKeyDown(note);
});

tutorial.on('keyUp', (note, time) => {
  sound.keyUp(note, time);
  keyboard.keyUp(note, time);
  glow.user();
  controls.onUserKeyUp(note);
});

tutorial.on('aiKeyDown', (note, time) => {
  sound.playNote(note, time, 0.4, true);
  keyboard.keyDown(note, time, true);
  keyboard.keyUp(note, time + 0.4, true);
  glow.ai(time);
  controls.onAiPlayNote(note, time, 0.4);
});

tutorial.on('aiKeyUp', (note, time) => {
  // Handled via playNote duration
});

// Start preloading piano & synth audio samples
sound.load();