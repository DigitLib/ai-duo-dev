/**
 * Modern RollNote for AI Duet.
 * Creates an interactive Three.js falling note mesh corresponding to key press.
 */

import * as THREE from 'three';
import { Roll } from './Roll.js';

const geometry = new THREE.PlaneGeometry(1, 1);
const userMaterial = new THREE.MeshBasicMaterial({ color: 0x1FB7EC, side: THREE.DoubleSide });
const aiMaterial = new THREE.MeshBasicMaterial({ color: 0xFFB729, side: THREE.DoubleSide });

export class RollNote {
  constructor(element, ai = false) {
    this.element = element;
    const box = this.element.getBoundingClientRect();
    const initialScaling = 3000;

    this.plane = new THREE.Mesh(geometry, ai ? aiMaterial : userMaterial);
    const margin = 4;
    const width = Math.max(box.width - margin * 2, 2);

    this.plane.scale.set(width, initialScaling, 1);
    this.plane.position.z = 0;
    this.plane.position.x = box.left + margin + width / 2;
    this.plane.position.y = Roll.bottom + initialScaling / 2;

    this.bottom = Roll.bottom;
    Roll.add(this.plane);
  }

  noteOff() {
    const dist = Roll.bottom - this.bottom;
    this.plane.scale.y = Math.max(dist, 5);
    this.plane.position.y = this.bottom + this.plane.scale.y / 2;
  }
}

export default RollNote;