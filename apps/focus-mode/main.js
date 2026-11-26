import * as THREE from "three";
import * as xb from "xrblocks";

const SCREEN_TAG = "focus-screen";

const SCREEN_WIDTH = 0.9;
const SCREEN_HEIGHT = 0.58;
const SCREEN_DEPTH = 0.035;

class FocusScreen extends xb.MeshScript {
  constructor({name, color, position}) {
    const geometry = new THREE.BoxGeometry(
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      SCREEN_DEPTH
    );
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.04,
      emissive: color,
      emissiveIntensity: 0.12,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    super(geometry, material);

    this.name = name;
    this.position.copy(position);
    // The panel itself is the semantic, movable focus screen.
    this.userData.xrblocksDevtools = {tag: SCREEN_TAG};

    // Plain-object manipulation uses the selected surface as the translate
    // handle. The panel follows the controller ray and turns to stay readable
    // while it is moved. Its resulting pose is retained on release.
    this.xb = {
      manipulation: {
        actions: {
          translate: {
            faceCamera: true,
            mode: "capsule",
            smoothing: 8,
          },
        },
      },
    };

    this.baseEmissiveIntensity = 0.12;
  }

  setFeedback(state) {
    if (!this.material || !(this.material instanceof THREE.MeshStandardMaterial)) {
      return;
    }
    if (state === "selected") {
      this.material.emissiveIntensity = 0.62;
    } else if (state === "hovered") {
      this.material.emissiveIntensity = 0.32;
    } else {
      this.material.emissiveIntensity = this.baseEmissiveIntensity;
    }
  }

  onHoverEnter(event) {
    this.setFeedback("hovered");
    event.stopPropagation();
  }

  onHoverExit(event) {
    this.setFeedback("idle");
    event.stopPropagation();
  }

  onObjectSelectStart(event) {
    this.setFeedback("selected");
    event.stopPropagation();
  }

  onObjectSelectEnd(event) {
    this.setFeedback("idle");
    event.stopPropagation();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

class FocusModeApp extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x555b66, 3.2));

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.4);
    fillLight.position.set(1.5, 3.0, 2.0);
    this.add(fillLight);

    const eyeHeight = xb.user.height || 1.6;
    const screenY = eyeHeight - 0.12;
    const lookTarget = new THREE.Vector3(0, screenY, 0);

    this.screens = [
      new FocusScreen({
        name: "Focus screen left",
        color: 0x315b8a,
        position: new THREE.Vector3(-0.9, screenY, -1.55),
      }),
      new FocusScreen({
        name: "Focus screen center",
        color: 0x3f6f63,
        position: new THREE.Vector3(0, screenY, -1.35),
      }),
      new FocusScreen({
        name: "Focus screen right",
        color: 0x8a563d,
        position: new THREE.Vector3(0.9, screenY, -1.55),
      }),
    ];

    for (const screen of this.screens) {
      this.add(screen);
      // Face the viewer's starting position with the broad side of the panel.
      screen.lookAt(lookTarget);
    }
  }

  dispose() {
    if (!this.screens) return;
    for (const screen of this.screens) {
      this.remove(screen);
    }
    this.screens.length = 0;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const options = new xb.Options();
  options.setAppTitle("Focus Mode");
  options.setAppDescription("Arrange three opaque focus screens around your space.");
  options.simulator.defaultMode = xb.SimulatorMode.CONTROLLER;
  options.enableReticles();

  xb.add(new FocusModeApp());
  xb.init(options);
});
