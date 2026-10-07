/**
 * Modern Note visual highlighter on keyboard key.
 */

import { RollNote } from '../roll/RollNote.js';

export class Note {
  constructor(container, ai = false) {
    this.element = document.createElement('div');
    this.element.classList.add('highlight');
    this.element.classList.add('active');
    if (ai) {
      this.element.classList.add('ai');
    }
    container.appendChild(this.element);

    this.rollNote = new RollNote(container, ai);
  }

  noteOff() {
    this.element.classList.remove('active');
    this.rollNote.noteOff();
    setTimeout(() => {
      if (this.element.parentNode) {
        this.element.remove();
      }
    }, 1000);
  }
}

export default Note;