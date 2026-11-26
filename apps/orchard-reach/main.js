import RAPIER from "@dimforge/rapier3d-simd-compat";
import * as THREE from "three";
import * as xb from "xrblocks";

const APPLE_RADIUS = 0.052;
const TOTAL_APPLES = 6;

const BASKET_POSITION = new THREE.Vector3(0, 0.90, -0.72);
const BASKET_INNER_WIDTH = 0.46;
const BASKET_INNER_DEPTH = 0.36;
const BASKET_WALL_HEIGHT = 0.26;
const BASKET_FLOOR_THICKNESS = 0.028;
const BASKET_WALL_THICKNESS = 0.028;

const ARC_POSITIONS = [
  new THREE.Vector3(-0.58, 1.22, -0.55),
  new THREE.Vector3(-0.38, 1.40, -0.66),
  new THREE.Vector3(-0.12, 1.50, -0.73),
  new THREE.Vector3(0.12, 1.50, -0.73),
  new THREE.Vector3(0.38, 1.40, -0.66),
  new THREE.Vector3(0.58, 1.22, -0.55),
];

const CORRIDOR_RADIUS = 0.17;
const CORRIDOR_ACTIVE_COLOR = 0x47c8ff;
const CORRIDOR_SUCCESS_COLOR = 0x4dff88;
const CORRIDOR_RETRY_COLOR = 0xff8a5c;

const SLOT_POSITIONS = [
  new THREE.Vector3(-0.15, 0, -0.075),
  new THREE.Vector3(0, 0, -0.075),
  new THREE.Vector3(0.15, 0, -0.075),
  new THREE.Vector3(-0.15, 0, 0.075),
  new THREE.Vector3(0, 0, 0.075),
  new THREE.Vector3(0.15, 0, 0.075),
];

const _worldPosition = new THREE.Vector3();
const _worldQuaternion = new THREE.Quaternion();
const _direction = new THREE.Vector3();
const _midpoint = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function addPrivate(object) {
  object.userData.xrblocksPrivate = true;
  object.traverse((child) => {
    child.userData.xrblocksPrivate = true;
  });
  return object;
}

class Apple extends xb.MeshScript {
  constructor(scene, index, homePosition) {
    const geometry = new THREE.SphereGeometry(APPLE_RADIUS, 28, 20);
    const material = new THREE.MeshStandardMaterial({
      color: 0xe84232,
      roughness: 0.36,
      metalness: 0.03,
      emissive: 0x4a0500,
      emissiveIntensity: 0.16,
    });
    super(geometry, material);

    this.scene = scene;
    this.index = index;
    this.homePosition = homePosition.clone();
    this.name = `Reach apple ${index + 1}`;
    this.position.copy(homePosition);
    this.userData.xrblocksDevtools = {
      tag: "reach-apple",
      state: {
        index,
        active: false,
        interactive: false,
        basketed: false,
        dropping: false,
      },
    };
    this.userData.appleIndex = index;
    this.userData.homePosition = homePosition.toArray();
    this.userData.basketed = false;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.008, 0.035, 8),
      new THREE.MeshStandardMaterial({color: 0x5a3218, roughness: 0.9})
    );
    stem.position.y = APPLE_RADIUS + 0.017;
    stem.rotation.z = -0.18;
    stem.userData.xrblocksPrivate = true;
    this.add(stem);
    this.stem = stem;

    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.019, 12, 8),
      new THREE.MeshStandardMaterial({
        color: 0x4d9d3d,
        roughness: 0.75,
        side: THREE.DoubleSide,
      })
    );
    leaf.scale.set(1.4, 0.35, 0.78);
    leaf.position.set(0.024, APPLE_RADIUS + 0.032, 0);
    leaf.rotation.z = -0.42;
    leaf.userData.xrblocksPrivate = true;
    this.add(leaf);
    this.leaf = leaf;

    this.setInteractive(false);
  }

  setInteractive(interactive) {
    if (interactive) {
      this.xb = {
        manipulation: {
          actions: {translate: {}},
          handle: {action: "translate"},
        },
      };
      this.material.emissiveIntensity = 0.34;
      this.userData.interactive = true;
      this.userData.xrblocksDevtools.state.interactive = true;
      this.userData.xrblocksDevtools.state.active = this.scene?.activeApple === this;
    } else {
      this.xb = {pointerEvents: "none"};
      this.material.emissiveIntensity = 0.10;
      this.userData.interactive = false;
      this.userData.xrblocksDevtools.state.interactive = false;
      this.userData.xrblocksDevtools.state.active = false;
    }
  }

  setSettledInBasket(slotPosition, slotIndex) {
    this.userData.basketed = true;
    this.userData.xrblocksDevtools.state.basketed = true;
    this.userData.xrblocksDevtools.state.dropping = false;
    this.setInteractive(false);
    this.position.copy(slotPosition);
    this.quaternion.setFromEuler(new THREE.Euler(0, slotIndex * 0.34, 0));
    this.scale.setScalar(1);
    this.material.emissiveIntensity = 0.14;
  }

  returnToBranch() {
    this.userData.basketed = false;
    this.userData.xrblocksDevtools.state.basketed = false;
    this.userData.xrblocksDevtools.state.dropping = false;
    this.position.copy(this.homePosition);
    this.quaternion.identity();
    this.scale.setScalar(1);
    this.material.emissiveIntensity = 0.10;
    this.setInteractive(false);
  }

  onHoverEnter(event) {
    if (this.userData.interactive) {
      this.scale.setScalar(1.07);
      event.stopPropagation();
    }
  }

  onHoverExit(event) {
    if (this.userData.interactive) {
      this.scale.setScalar(1);
      event.stopPropagation();
    }
  }

  onObjectTouchStart(event) {
    // Keep the default touch selection enabled. Automatic manipulation and
    // grab ownership begin only when the pinch/manipulation actually starts.
    if (this.userData.interactive && !this.scene.heldApple) {
      this.scale.setScalar(1.04);
    }
    event.stopPropagation();
  }

  onObjectTouchEnd(event) {
    if (this.userData.interactive && !this.scene.heldApple && !this.scene.dropping) {
      this.scale.setScalar(1);
    }
    event.stopPropagation();
  }

  onObjectGrabStart(event) {
    if (this.userData.interactive) this.scene.beginGrab(this);
    event.stopPropagation();
  }

  onObjectSelectEnd(event) {
    if (event.reason !== "released" && event.reason !== "released-outside") {
      this.scene.interruptGrab(this);
    } else if (this.scene.heldApple === this && !this.scene.dropping) {
      this.scene.releaseApple(this);
    }
    event.stopPropagation();
  }

  onObjectManipulate(event) {
    if (event.owner !== this) return;
    if (event.phase === "start") {
      this.scene.beginGrab(this);
    } else if (event.phase === "end") {
      this.scene.releaseApple(this);
    } else if (event.phase === "cancel") {
      this.scene.cancelGrab(this);
    }
    event.stopPropagation();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.stem.geometry.dispose();
    this.stem.material.dispose();
    this.leaf.geometry.dispose();
    this.leaf.material.dispose();
  }
}

class Basket extends xb.Script {
  constructor(scene) {
    super();
    this.scene = scene;
    this.name = "Apple basket";
    this.position.copy(BASKET_POSITION);
    this.userData.xrblocksDevtools = {
      tag: "apple-basket",
      state: {progress: 0, completed: false, resetReady: false},
    };
    this.userData.completed = false;

    this.woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x9a5a2f,
      roughness: 0.74,
      metalness: 0.02,
    });
    this.rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xc58a4b,
      roughness: 0.62,
      metalness: 0.03,
    });
    this.weaveMaterial = new THREE.MeshStandardMaterial({
      color: 0x6f3d20,
      roughness: 0.9,
    });

    const halfW = BASKET_INNER_WIDTH / 2;
    const halfD = BASKET_INNER_DEPTH / 2;
    const wallY = BASKET_FLOOR_THICKNESS + BASKET_WALL_HEIGHT / 2;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(
        BASKET_INNER_WIDTH + BASKET_WALL_THICKNESS * 2,
        BASKET_FLOOR_THICKNESS,
        BASKET_INNER_DEPTH + BASKET_WALL_THICKNESS * 2
      ),
      this.woodMaterial
    );
    floor.position.y = BASKET_FLOOR_THICKNESS / 2;
    this.add(floor);

    const wallGeometries = [
      new THREE.BoxGeometry(BASKET_WALL_THICKNESS, BASKET_WALL_HEIGHT, BASKET_INNER_DEPTH),
      new THREE.BoxGeometry(BASKET_WALL_THICKNESS, BASKET_WALL_HEIGHT, BASKET_INNER_DEPTH),
      new THREE.BoxGeometry(BASKET_INNER_WIDTH, BASKET_WALL_HEIGHT, BASKET_WALL_THICKNESS),
      new THREE.BoxGeometry(BASKET_INNER_WIDTH, BASKET_WALL_HEIGHT, BASKET_WALL_THICKNESS),
    ];
    const wallPositions = [
      [-halfW - BASKET_WALL_THICKNESS / 2, wallY, 0],
      [halfW + BASKET_WALL_THICKNESS / 2, wallY, 0],
      [0, wallY, -halfD - BASKET_WALL_THICKNESS / 2],
      [0, wallY, halfD + BASKET_WALL_THICKNESS / 2],
    ];
    this.walls = [];
    for (let i = 0; i < wallGeometries.length; i++) {
      const wall = new THREE.Mesh(wallGeometries[i], this.woodMaterial);
      wall.position.set(...wallPositions[i]);
      this.add(wall);
      this.walls.push(wall);
    }

    const railY = BASKET_FLOOR_THICKNESS + BASKET_WALL_HEIGHT + 0.012;
    const railGeometryX = new THREE.BoxGeometry(
      BASKET_INNER_WIDTH + BASKET_WALL_THICKNESS * 3,
      0.024,
      0.035
    );
    const railGeometryZ = new THREE.BoxGeometry(
      0.035,
      0.024,
      BASKET_INNER_DEPTH + BASKET_WALL_THICKNESS * 3
    );
    const frontRail = new THREE.Mesh(railGeometryX, this.rimMaterial);
    frontRail.position.set(0, railY, halfD + BASKET_WALL_THICKNESS / 2);
    this.add(frontRail);
    const backRail = new THREE.Mesh(railGeometryX, this.rimMaterial);
    backRail.position.set(0, railY, -halfD - BASKET_WALL_THICKNESS / 2);
    this.add(backRail);
    const leftRail = new THREE.Mesh(railGeometryZ, this.rimMaterial);
    leftRail.position.set(-halfW - BASKET_WALL_THICKNESS / 2, railY, 0);
    this.add(leftRail);
    const rightRail = new THREE.Mesh(railGeometryZ, this.rimMaterial);
    rightRail.position.set(halfW + BASKET_WALL_THICKNESS / 2, railY, 0);
    this.add(rightRail);

    // Horizontal weave bands make the basket legible as a physical container.
    const bandGeometry = new THREE.BoxGeometry(
      BASKET_INNER_WIDTH + BASKET_WALL_THICKNESS * 2.15,
      0.012,
      0.012
    );
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(bandGeometry, this.weaveMaterial);
      band.position.set(0, 0.075 + i * 0.065, halfD + BASKET_WALL_THICKNESS / 2 + 0.001);
      this.add(band);
      const backBand = new THREE.Mesh(bandGeometry, this.weaveMaterial);
      backBand.position.set(0, 0.075 + i * 0.065, -halfD - BASKET_WALL_THICKNESS / 2 - 0.001);
      this.add(backBand);
    }

    const targetRing = new THREE.Mesh(
      new THREE.TorusGeometry(BASKET_INNER_WIDTH * 0.34, 0.008, 8, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffd57a,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    targetRing.rotation.x = Math.PI / 2;
    targetRing.position.y = railY + 0.018;
    this.add(targetRing);
    this.targetRing = targetRing;

    const card = new xb.UICard({
      size: {width: 0.46, height: 0.16},
      appearance: "none",
      pointerEvents: "none",
      style: {
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: 10,
        backgroundColor: "#101820c8",
        borderRadius: 16,
      },
    });
    card.position.set(0, 0.47, 0);
    this.add(card);
    this.progressText = new xb.UIText({
      text: "0 of 6",
      style: {
        fontSize: 30,
        fontWeight: "bold",
        color: "#ffffff",
        textAlign: "center",
      },
    });
    this.hintText = new xb.UIText({
      text: "Grab, move over the basket, release",
      style: {
        fontSize: 12,
        color: "#d6f4ff",
        textAlign: "center",
        whiteSpace: "nowrap",
      },
    });
    card.add(this.progressText, this.hintText);
    this.card = card;
  }

  setProgress(count, completed = false) {
    this.progressText.text = `${count} of ${TOTAL_APPLES}`;
    this.userData.completed = completed;
    this.userData.xrblocksDevtools.state.progress = count;
    this.userData.xrblocksDevtools.state.completed = completed;
    this.userData.xrblocksDevtools.state.resetReady = completed;
    if (completed) {
      this.hintText.text = "Touch the full basket to reset";
      this.targetRing.material.color.set(0x4dff88);
      this.targetRing.material.opacity = 0.95;
    } else {
      this.hintText.text = "Grab, move over the basket, release";
      this.targetRing.material.color.set(0xffd57a);
      this.targetRing.material.opacity = 0.72;
    }
  }

  onObjectSelectStart(event) {
    if (this.scene?.completed) {
      this.scene.restoreApples();
      event.stopPropagation();
    }
  }

  onObjectTouchStart(event) {
    if (this.scene?.completed) {
      event.preventDefault();
      this.scene.restoreApples();
      event.stopPropagation();
    }
  }

  dispose() {
    this.woodMaterial.dispose();
    this.rimMaterial.dispose();
    this.weaveMaterial.dispose();
    this.targetRing.geometry.dispose();
    this.targetRing.material.dispose();
  }
}

class OrchardReach extends xb.Script {
  constructor() {
    super();
    this.name = "Orchard Reach";
    this.apples = [];
    this.activeIndex = -1;
    this.activeApple = null;
    this.heldApple = null;
    this.dropping = null;
    this.completed = false;
    this.progress = 0;
    this.successPause = 0;
    this.retryPause = 0;
    this.lastUpdateTime = 0;
    this.physics = null;
    this.RAPIER = null;
    this.basketBody = null;
    this.resetLockedUntil = 0;
  }

  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x304050, 2.4));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(1.2, 2.8, 1.4);
    this.add(key);
    const fill = new THREE.DirectionalLight(0x9ed8ff, 1.1);
    fill.position.set(-2, 1.5, -1);
    this.add(fill);

    const backdrop = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 0.02, 64, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x111a21,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      })
    );
    backdrop.position.set(0, 1.0, -0.2);
    reflectableDecoration(backdrop);
    this.add(backdrop);

    this.pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, BASKET_POSITION.y - BASKET_FLOOR_THICKNESS, 24),
      new THREE.MeshStandardMaterial({color: 0x25343b, roughness: 0.82})
    );
    this.pedestal.position.set(
      BASKET_POSITION.x,
      (BASKET_POSITION.y - BASKET_FLOOR_THICKNESS) / 2,
      BASKET_POSITION.z
    );
    addPrivate(this.pedestal);
    this.add(this.pedestal);

    this.corridor = this.createCorridor();
    this.add(this.corridor);

    for (let i = 0; i < TOTAL_APPLES; i++) {
      this.addBranchesForApple(i, ARC_POSITIONS[i]);
      const apple = new Apple(this, i, ARC_POSITIONS[i]);
      this.add(apple);
      this.apples.push(apple);
    }

    this.basket = new Basket(this);
    this.add(this.basket);
    this.basket.setProgress(0, false);

    this.halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.073, 0.005, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfff0aa,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    this.halo.userData.xrblocksPrivate = true;
    this.add(this.halo);

    this.activateApple(0);
  }

  initPhysics(physics) {
    this.physics = physics;
    this.RAPIER = physics.RAPIER;
    this.createBasketColliders();
  }

  createCorridor() {
    const geometry = new THREE.CylinderGeometry(
      CORRIDOR_RADIUS,
      CORRIDOR_RADIUS,
      1,
      32,
      1,
      true
    );
    const material = new THREE.MeshBasicMaterial({
      color: CORRIDOR_ACTIVE_COLOR,
      transparent: true,
      opacity: 0.19,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const corridor = new THREE.Mesh(geometry, material);
    corridor.name = "Active reach corridor";
    corridor.userData.state = "active";
    corridor.userData.xrblocksDevtools = {
      tag: "apple-reach-corridor",
      state: {state: "active", activeIndex: 0},
    };
    corridor.renderOrder = 3;
    corridor.geometry.computeBoundingSphere();

    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(CORRIDOR_RADIUS * 1.02, CORRIDOR_RADIUS * 1.02, 1, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xb9f2ff,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
        wireframe: true,
      })
    );
    wire.userData.xrblocksPrivate = true;
    corridor.add(wire);
    corridor.wire = wire;
    return corridor;
  }

  addBranchesForApple(index, homePosition) {
    const branch = new THREE.Group();
    branch.position.copy(homePosition);
    const twig = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.012, 0.16, 8),
      new THREE.MeshStandardMaterial({color: 0x704522, roughness: 0.95})
    );
    twig.rotation.z = Math.PI / 2;
    twig.position.set(0.10, -0.055, -0.015);
    branch.add(twig);
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 8),
      new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? 0x3d8f48 : 0x56a44f,
        roughness: 0.82,
        side: THREE.DoubleSide,
      })
    );
    leaf.scale.set(1.6, 0.35, 0.8);
    leaf.position.set(0.15, -0.035, -0.015);
    leaf.rotation.z = 0.2;
    branch.add(leaf);
    addPrivate(branch);
    this.add(branch);
    return branch;
  }

  createBasketColliders() {
    const world = this.physics.blendedWorld;
    const RAPIERModule = this.RAPIER;
    this.basketBody = world.createRigidBody(
      RAPIERModule.RigidBodyDesc.fixed().setTranslation(
        BASKET_POSITION.x,
        BASKET_POSITION.y,
        BASKET_POSITION.z
      )
    );

    const addBox = (hx, hy, hz, x, y, z) => {
      const collider = world.createCollider(
        RAPIERModule.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(x, y, z)
          .setFriction(0.72)
          .setRestitution(0.04),
        this.basketBody
      );
      return collider;
    };

    const halfW = BASKET_INNER_WIDTH / 2;
    const halfD = BASKET_INNER_DEPTH / 2;
    const wallY = BASKET_FLOOR_THICKNESS + BASKET_WALL_HEIGHT / 2;

    addBox(
      halfW + BASKET_WALL_THICKNESS,
      BASKET_FLOOR_THICKNESS / 2,
      halfD + BASKET_WALL_THICKNESS,
      0,
      BASKET_FLOOR_THICKNESS / 2,
      0
    );
    addBox(
      BASKET_WALL_THICKNESS / 2,
      BASKET_WALL_HEIGHT / 2,
      halfD,
      -halfW - BASKET_WALL_THICKNESS / 2,
      wallY,
      0
    );
    addBox(
      BASKET_WALL_THICKNESS / 2,
      BASKET_WALL_HEIGHT / 2,
      halfD,
      halfW + BASKET_WALL_THICKNESS / 2,
      wallY,
      0
    );
    addBox(
      halfW,
      BASKET_WALL_HEIGHT / 2,
      BASKET_WALL_THICKNESS / 2,
      0,
      wallY,
      -halfD - BASKET_WALL_THICKNESS / 2
    );
    addBox(
      halfW,
      BASKET_WALL_HEIGHT / 2,
      BASKET_WALL_THICKNESS / 2,
      0,
      wallY,
      halfD + BASKET_WALL_THICKNESS / 2
    );
  }

  activateApple(index) {
    if (index < 0 || index >= TOTAL_APPLES || this.completed) return;
    this.activeIndex = index;
    this.activeApple = this.apples[index];
    for (let i = 0; i < this.apples.length; i++) {
      const apple = this.apples[i];
      if (i === index) {
        apple.setInteractive(true);
        apple.material.color.set(0xf04b3a);
        apple.material.emissiveIntensity = 0.34;
      } else if (!apple.userData.basketed) {
        apple.setInteractive(false);
        apple.material.color.set(0xb84c43);
      }
    }

    this.updateCorridorForApple(this.activeApple);
    this.setCorridorFeedback("active");
    this.halo.visible = true;
    this.halo.position.copy(this.activeApple.position);
    this.halo.quaternion.identity();
    this.halo.userData.activeAppleIndex = index;
    this.activeApple.userData.active = true;
    this.activeApple.userData.xrblocksDevtools.state.active = true;
    this.activeApple.userData.xrblocksDevtools.state.interactive = true;
    for (const apple of this.apples) {
      if (apple !== this.activeApple) apple.userData.xrblocksDevtools.state.active = false;
    }
    this.basket.setProgress(this.progress, false);
  }

  updateCorridorForApple(apple) {
    if (!apple) return;
    const end = apple.homePosition.clone();
    const start = new THREE.Vector3(end.x * 0.24, 1.22, -0.13);
    _direction.subVectors(end, start);
    const length = _direction.length();
    if (length < 0.001) return;
    _midpoint.addVectors(start, end).multiplyScalar(0.5);
    this.corridor.position.copy(_midpoint);
    this.corridor.quaternion.setFromUnitVectors(_up, _direction.normalize());
    this.corridor.scale.set(1, length, 1);
    this.corridor.updateMatrixWorld(true);
  }

  setCorridorFeedback(state) {
    this.corridor.userData.state = state;
    this.corridor.userData.xrblocksDevtools.state.state = state;
    this.corridor.userData.xrblocksDevtools.state.activeIndex = this.activeIndex;
    if (state === "success") {
      this.corridor.material.color.set(CORRIDOR_SUCCESS_COLOR);
      this.corridor.material.opacity = 0.30;
      this.corridor.wire.material.color.set(0x9affbd);
    } else if (state === "retry") {
      this.corridor.material.color.set(CORRIDOR_RETRY_COLOR);
      this.corridor.material.opacity = 0.25;
      this.corridor.wire.material.color.set(0xffc0a0);
    } else if (state === "held") {
      this.corridor.material.color.set(0x89e4ff);
      this.corridor.material.opacity = 0.28;
      this.corridor.wire.material.color.set(0xd7f8ff);
    } else {
      this.corridor.material.color.set(CORRIDOR_ACTIVE_COLOR);
      this.corridor.material.opacity = 0.19;
      this.corridor.wire.material.color.set(0xb9f2ff);
    }
  }

  beginGrab(apple) {
    if (this.completed || apple !== this.activeApple || this.dropping) return;
    if (this.heldApple !== apple) {
      this.heldApple = apple;
      apple.scale.setScalar(1.08);
      apple.material.emissiveIntensity = 0.52;
      this.halo.visible = false;
      this.setCorridorFeedback("held");
    }
  }

  releaseApple(apple) {
    if (apple !== this.activeApple || this.heldApple !== apple) return;
    this.heldApple = null;
    apple.scale.setScalar(1);
    apple.material.emissiveIntensity = 0.34;
    this.dropApple(apple);
  }

  dropApple(apple) {
    if (!this.physics || !this.RAPIER || this.dropping) {
      this.returnActiveAppleHome();
      return;
    }

    apple.getWorldPosition(_worldPosition);
    apple.getWorldQuaternion(_worldQuaternion);
    const world = this.physics.blendedWorld;
    const RAPIERModule = this.RAPIER;
    const body = world.createRigidBody(
      RAPIERModule.RigidBodyDesc.dynamic()
        .setTranslation(_worldPosition.x, _worldPosition.y, _worldPosition.z)
        .setRotation({
          x: _worldQuaternion.x,
          y: _worldQuaternion.y,
          z: _worldQuaternion.z,
          w: _worldQuaternion.w,
        })
        .setLinvel(0, 0, 0)
        .setAngvel({x: 0, y: 0, z: 0})
        .setLinearDamping(0.08)
        .setAngularDamping(0.5)
        .setCcdEnabled(true)
    );
    world.createCollider(
      RAPIERModule.ColliderDesc.ball(APPLE_RADIUS)
        .setDensity(0.85)
        .setFriction(0.72)
        .setRestitution(0.08),
      body
    );

    this.dropping = {
      apple,
      body,
      elapsed: 0,
      settleTime: 0,
    };
    apple.userData.dropping = true;
    apple.userData.xrblocksDevtools.state.dropping = true;
    this.setCorridorFeedback("active");
  }

  cancelGrab(apple) {
    if (apple !== this.activeApple || this.heldApple !== apple) return;
    this.heldApple = null;
    apple.scale.setScalar(1);
    apple.material.emissiveIntensity = 0.34;
    this.returnActiveAppleHome();
    this.showRetryFeedback();
  }

  interruptGrab(apple) {
    if (apple !== this.activeApple) return;
    this.heldApple = null;
    apple.scale.setScalar(1);
    apple.material.emissiveIntensity = 0.34;
    this.removeDroppingBody();
    this.returnActiveAppleHome();
    this.showRetryFeedback();
  }

  returnActiveAppleHome() {
    if (!this.activeApple) return;
    this.removeDroppingBody();
    this.activeApple.returnToBranch();
    if (!this.completed) this.activeApple.setInteractive(true);
    this.activeApple.material.color.set(0xf04b3a);
    this.activeApple.material.emissiveIntensity = 0.34;
    this.activeApple.userData.xrblocksDevtools.state.dropping = false;
    this.halo.visible = true;
    this.halo.position.copy(this.activeApple.position);
    this.setCorridorFeedback("active");
  }

  showRetryFeedback() {
    this.retryPause = 0.55;
    this.setCorridorFeedback("retry");
  }

  removeDroppingBody() {
    if (!this.dropping) return;
    const {body} = this.dropping;
    this.physics?.blendedWorld.removeRigidBody(body);
    this.dropping.apple.userData.dropping = false;
    this.dropping.apple.userData.xrblocksDevtools.state.dropping = false;
    this.dropping = null;
  }

  settleAppleInBasket(apple) {
    const slotIndex = this.progress;
    const slot = SLOT_POSITIONS[slotIndex] || SLOT_POSITIONS[TOTAL_APPLES - 1];
    const slotPosition = new THREE.Vector3(
      BASKET_POSITION.x + slot.x,
      BASKET_POSITION.y + BASKET_FLOOR_THICKNESS + APPLE_RADIUS,
      BASKET_POSITION.z + slot.z
    );
    this.removeDroppingBody();
    apple.setSettledInBasket(slotPosition, slotIndex);
    this.progress += 1;
    this.basket.setProgress(this.progress, this.progress === TOTAL_APPLES);
    this.setCorridorFeedback("success");
    this.halo.visible = false;

    if (this.progress === TOTAL_APPLES) {
      this.completed = true;
      this.activeApple = null;
      this.activeIndex = -1;
      this.successPause = 0;
      this.basket.setProgress(TOTAL_APPLES, true);
      this.corridor.userData.state = "success";
      this.corridor.userData.xrblocksDevtools.state.state = "success";
    } else {
      this.successPause = 0.9;
      this.activeApple = null;
      this.activeIndex = -1;
    }
  }

  restoreApples() {
    if (!this.completed) return;
    const now = performance.now();
    if (now < this.resetLockedUntil) return;
    this.resetLockedUntil = now + 500;

    this.removeDroppingBody();
    this.heldApple = null;
    this.progress = 0;
    this.completed = false;
    this.successPause = 0;
    this.retryPause = 0;
    this.activeIndex = -1;
    this.activeApple = null;
    this.basket.setProgress(0, false);

    for (const apple of this.apples) {
      apple.returnToBranch();
      apple.material.color.set(0xb84c43);
    }

    this.basket.userData.completed = false;
    this.activateApple(0);
  }

  physicsStep() {
    if (!this.dropping) return;
    const state = this.dropping;
    state.elapsed += this.physics?.timestep || 1 / 45;
    const body = state.body;
    const translation = body.translation();
    const rotation = body.rotation();
    state.apple.position.set(translation.x, translation.y, translation.z);
    state.apple.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    const velocity = body.linvel();
    const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
    const withinBasketX = Math.abs(translation.x - BASKET_POSITION.x) < BASKET_INNER_WIDTH / 2;
    const withinBasketZ = Math.abs(translation.z - BASKET_POSITION.z) < BASKET_INNER_DEPTH / 2;
    const nearBasketBottom =
      translation.y <
      BASKET_POSITION.y + BASKET_FLOOR_THICKNESS + APPLE_RADIUS * 2.3;
    const insideBasket = withinBasketX && withinBasketZ && nearBasketBottom;

    if (insideBasket && speedSq < 0.012) {
      state.settleTime += this.physics?.timestep || 1 / 45;
    } else {
      state.settleTime = 0;
    }

    if (state.settleTime >= 0.24) {
      this.settleAppleInBasket(state.apple);
      return;
    }

    const fellOut =
      translation.y < BASKET_POSITION.y - 0.22 ||
      state.elapsed > 5.0 ||
      Math.abs(translation.x - BASKET_POSITION.x) > 1.0 ||
      Math.abs(translation.z - BASKET_POSITION.z) > 1.0;

    if (fellOut) {
      this.removeDroppingBody();
      this.returnActiveAppleHome();
      this.showRetryFeedback();
    }
  }

  update(time) {
    const delta = this.lastUpdateTime ? Math.min((time - this.lastUpdateTime) / 1000, 0.1) : 0;
    this.lastUpdateTime = time;

    if (this.successPause > 0) {
      this.successPause -= delta;
      if (this.successPause <= 0 && !this.completed) {
        this.successPause = 0;
        this.activateApple(this.progress);
      }
    }

    if (this.retryPause > 0) {
      this.retryPause -= delta;
      if (this.retryPause <= 0) {
        this.retryPause = 0;
        if (this.activeApple && !this.completed && !this.heldApple) {
          this.setCorridorFeedback("active");
        }
      }
    }

    if (this.activeApple) {
      if (this.heldApple) {
        this.halo.visible = false;
      } else if (!this.dropping) {
        this.halo.visible = true;
        this.halo.position.copy(this.activeApple.position);
        this.halo.rotation.z += delta * 0.8;
      }
      if (this.corridor.userData.state === "active") {
        this.corridor.material.opacity = 0.17 + Math.sin(time * 0.004) * 0.035;
      }
    }
  }

  dispose() {
    this.removeDroppingBody();
    if (this.basketBody && this.physics) {
      this.physics.blendedWorld.removeRigidBody(this.basketBody);
      this.basketBody = null;
    }
    this.corridor.geometry.dispose();
    this.corridor.material.dispose();
    this.corridor.wire.geometry.dispose();
    this.corridor.wire.material.dispose();
    for (const apple of this.apples) apple.dispose();
    this.halo.geometry.dispose();
    this.halo.material.dispose();
    this.pedestal.geometry.dispose();
    this.pedestal.material.dispose();
  }
}

function reflectableDecoration(object) {
  object.userData.xrblocksPrivate = true;
  return object;
}

const options = new xb.Options();
options.physics.RAPIER = RAPIER;
options.enableHands();
options.hands.visualization = true;
options.enableReticles();
options.simulator.defaultMode = xb.SimulatorMode.CONTROLLER;
options.simulator.modeToggle.enabled = true;
options.xrButton.showEnterSimulatorButton = true;
options.xrButton.appTitle = "Orchard Reach";
options.xrButton.appDescription = "Grab apples, carry them over the basket, and release them.";

document.addEventListener("DOMContentLoaded", async () => {
  xb.add(new OrchardReach());
  await xb.init(options);
});
