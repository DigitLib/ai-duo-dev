/**
 * Modern Three.js Piano Roll Visualizer for AI Duet.
 * Renders glowing falling notes (cyan for user, amber for AI).
 */

import * as THREE from 'three';

const noteGeometry = new THREE.PlaneGeometry(1, 1);
const userMaterial = new THREE.MeshBasicMaterial({ color: 0x1FB7EC, side: THREE.DoubleSide });
const aiMaterial = new THREE.MeshBasicMaterial({ color: 0xFFB729, side: THREE.DoubleSide });

class RollClass {
  constructor() {
    this._element = document.createElement('div');
    this._element.id = 'roll';

    this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 1, 1000);
    this._camera.position.z = 1;
    this._camera.lookAt(new THREE.Vector3(0, 0, 0));

    this._scene = new THREE.Scene();

    this._renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this._renderer.setClearColor(0x000000, 0);
    this._renderer.setPixelRatio(window.devicePixelRatio || 1);
    this._renderer.sortObjects = false;
    this._element.appendChild(this._renderer.domElement);

    this._currentNotes = {};
    this._lastUpdate = performance.now();

    this._boundLoop = this._loop.bind(this);
    requestAnimationFrame(this._boundLoop);

    window.addEventListener('resize', this._resize.bind(this));
  }

  get bottom() {
    return this._element.clientHeight + this._camera.position.y;
  }

  appendTo(container) {
    container.appendChild(this._element);
    this._resize();
  }

  add(mesh) {
    this._scene.add(mesh);
  }

  keyDown(midi, box, ai = false) {
    const selector = ai ? `ai${midi}` : `${midi}`;
    if (!this._currentNotes[selector]) {
      this._currentNotes[selector] = [];
    }

    if (midi && box) {
      const initialScaling = 10000;
      const plane = new THREE.Mesh(noteGeometry, ai ? aiMaterial : userMaterial);
      const margin = 4;
      const width = Math.max(box.width - margin * 2, 2);

      plane.scale.set(width, initialScaling, 1);
      plane.position.z = 0;
      plane.position.x = box.left + margin + width / 2;
      plane.position.y = this._element.clientHeight + this._camera.position.y + initialScaling / 2;

      this._scene.add(plane);

      this._currentNotes[selector].push({
        plane,
        position: this._camera.position.y
      });
    }
  }

  keyUp(midi, ai = false) {
    const selector = ai ? `ai${midi}` : `${midi}`;
    if (this._currentNotes[selector] && this._currentNotes[selector].length > 0) {
      const note = this._currentNotes[selector].shift();
      const plane = note.plane;
      const position = note.position;

      plane.scale.y = Math.max(this._camera.position.y - position, 5);
      plane.position.y = this._element.clientHeight + position + plane.scale.y / 2;

      // Clean up plane from scene after it scrolls off screen
      setTimeout(() => {
        this._scene.remove(plane);
        if (plane.geometry) plane.geometry.dispose();
      }, 30000);
    }
  }

  _resize() {
    const width = this._element.clientWidth || window.innerWidth;
    const height = this._element.clientHeight || (window.innerHeight - 130);

    this._camera.left = 0;
    this._camera.bottom = height;
    this._camera.right = width;
    this._camera.top = 0;

    this._camera.updateProjectionMatrix();
    this._renderer.setSize(width, height);
  }

  _loop(timestamp) {
    const delta = timestamp - this._lastUpdate;
    this._lastUpdate = timestamp;

    this._renderer.render(this._scene, this._camera);
    this._camera.position.y += (1 / 10) * (delta || 16);

    requestAnimationFrame(this._boundLoop);
  }
}

export const Roll = new RollClass();
export default Roll;