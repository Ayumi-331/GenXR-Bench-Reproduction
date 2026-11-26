import RAPIER from "@dimforge/rapier3d-simd-compat";
import * as THREE from "three";
import * as xb from "xrblocks";

const CUP_COUNT = 6;
const MAX_BALLS = 10;
const BALL_RADIUS = 0.03;
const CUP_HEIGHT = 0.14;
const CUP_TOP_RADIUS = 0.065;
const CUP_BOTTOM_RADIUS = 0.048;
const CUP_WALL_THICKNESS = 0.004;
const BALL_LIFETIME_MS = 3500;
const BALL_MAX_DISTANCE_FROM_CUPS = 5.5;
const CUP_SPACING = 0.15;
const CUP_ROW_SPACING = 0.165;
const CUP_INNER_RADIUS = CUP_TOP_RADIUS - CUP_WALL_THICKNESS;

function isFiniteVector(vector) {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

class DigitalBeerpong extends xb.Script {
  constructor() {
    super();
    this.name = "Digital Beerpong";
    this.cups = [];
    this.heldBalls = new Map();
    this.releasedBalls = [];
    this.ballsUsed = 0;
    this.cupsScored = 0;
    this.gameOver = false;
    this.replayCount = 0;
    this.placementStarted = false;
    this.placementFinished = false;
    this.usingFallbackSurface = false;
    this.physics = null;
    this.RAPIER = null;
    this.cupColliderBodies = [];
    this.environmentBodies = [];
    this.planeColliderBodies = new Map();
    this.lastUiStateKey = "";
    this.handState = [
      this.makeHandState(0),
      this.makeHandState(1),
    ];

    this.scratchA = new THREE.Vector3();
    this.scratchB = new THREE.Vector3();
    this.scratchC = new THREE.Vector3();
    this.scratchQuat = new THREE.Quaternion();
    this.scratchMatrix = new THREE.Matrix4();

    this.ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 24, 16);
    this.ballMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8a1e,
      roughness: 0.34,
      metalness: 0.05,
      emissive: 0x4a1700,
      emissiveIntensity: 0.22,
    });
    this.cupGeometry = new THREE.CylinderGeometry(
      CUP_TOP_RADIUS,
      CUP_BOTTOM_RADIUS,
      CUP_HEIGHT,
      28,
      1,
      true
    );
    this.cupBottomGeometry = new THREE.CircleGeometry(CUP_BOTTOM_RADIUS, 28);
    this.cupBottomGeometry.rotateX(-Math.PI / 2);
    this.cupRimGeometry = new THREE.TorusGeometry(
      CUP_TOP_RADIUS,
      0.0035,
      8,
      28
    );
    this.cupRimGeometry.rotateX(Math.PI / 2);
    this.cupStripeGeometry = new THREE.TorusGeometry(
      (CUP_TOP_RADIUS + CUP_BOTTOM_RADIUS) * 0.5 + 0.001,
      0.004,
      8,
      28
    );
    this.cupStripeGeometry.rotateX(Math.PI / 2);
  }

  makeHandState(index) {
    return {
      index,
      selecting: false,
      anchor: new THREE.Vector3(),
      previousAnchor: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      hasAnchor: false,
      lastSampleMs: 0,
    };
  }

  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x2b3242, 3.2));
    const keyLight = new THREE.DirectionalLight(0xfff2df, 2.2);
    keyLight.position.set(-1.2, 2.8, 1.5);
    this.add(keyLight);

    this.cupsRoot = new THREE.Group();
    this.cupsRoot.name = "Beerpong cup layout";
    this.add(this.cupsRoot);
    this.createCups();

    // A provisional pose keeps the layout available as soon as the scene
    // starts. The real placement replaces it as soon as a detected horizontal
    // surface is available.
    this.cupsRoot.position.set(0, 0.78, -1.0);
    this.cupsRoot.rotation.set(0, 0, 0);

    this.createUi();
    this.updateUiState(true);

    this.syncExposedState();
    window.__digitalBeerpong = this;
  }

  initPhysics(physics) {
    this.physics = physics;
    this.RAPIER = physics.RAPIER;

    // Invisible safety colliders make the experience behave as a room even on
    // devices/simulator environments that do not expose every real surface.
    this.addFallbackRoomColliders();
    this.refreshPlaneColliders();

    if (this.placementFinished) {
      this.rebuildCupColliders();
      this.ensureCupSurfaceCollider();
    }
  }

  createCups() {
    const positions = [
      [-CUP_SPACING, -CUP_ROW_SPACING],
      [0, -CUP_ROW_SPACING],
      [CUP_SPACING, -CUP_ROW_SPACING],
      [-CUP_SPACING * 0.5, 0],
      [CUP_SPACING * 0.5, 0],
      [0, CUP_ROW_SPACING],
    ];

    for (let index = 0; index < CUP_COUNT; index += 1) {
      const cup = new THREE.Group();
      cup.name = `Beerpong cup ${index + 1}`;
      cup.position.set(positions[index][0], 0, positions[index][1]);

      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xf7f5ef,
        roughness: 0.55,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });
      const stripeMaterial = new THREE.MeshStandardMaterial({
        color: 0xd93a32,
        roughness: 0.5,
        metalness: 0.02,
      });

      const body = new THREE.Mesh(this.cupGeometry, bodyMaterial);
      body.position.y = CUP_HEIGHT * 0.5;
      body.castShadow = true;
      body.receiveShadow = true;

      const bottom = new THREE.Mesh(
        this.cupBottomGeometry,
        bodyMaterial
      );
      bottom.position.y = 0.003;
      bottom.receiveShadow = true;

      const rim = new THREE.Mesh(this.cupRimGeometry, stripeMaterial);
      rim.position.y = CUP_HEIGHT;
      rim.castShadow = true;

      const stripe = new THREE.Mesh(
        this.cupStripeGeometry,
        stripeMaterial
      );
      stripe.position.y = CUP_HEIGHT * 0.63;

      cup.add(body, bottom, rim, stripe);
      cup.userData.xrblocksDevtools = {
        tag: "beerpong-cup",
        state: {
          cupIndex: index,
          scored: false,
          visible: true,
        },
      };
      cup.userData.cupIndex = index;
      cup.userData.bodyMaterial = bodyMaterial;
      cup.userData.stripeMaterial = stripeMaterial;

      this.cupsRoot.add(cup);
      this.cups.push({
        index,
        group: cup,
        bodyMaterial,
        stripeMaterial,
        scored: false,
      });
    }
  }

  createUi() {
    const statusPanel = new xb.UIPanel({
      style: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 12,
        backgroundColor: "#121827e8",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#7f8da6aa",
      },
      children: [
        new xb.UIText({
          text: "10 balls remaining",
          style: {
            fontSize: 20,
            fontWeight: "bold",
            color: "#ffd166",
          },
        }),
        new xb.UIText({
          text: "0 cups scored",
          style: {
            fontSize: 20,
            fontWeight: "bold",
            color: "#91e5b4",
          },
        }),
        new xb.UIButton({
          label: "Replay",
          style: {
            width: 118,
            height: 42,
            borderRadius: 14,
            backgroundColor: "#2f6fed",
            color: "#ffffff",
            fontWeight: "bold",
          },
          onClick: () => this.replay(),
        }),
      ],
    });
    // Keep references to the exact text nodes that the user sees and update
    // their text in place.
    this.ballsText = statusPanel.children[0];
    this.cupsText = statusPanel.children[1];
    this.replayButton = statusPanel.children[2];
    this.replayButton.name = "Replay";
    this.replayButton.userData.xrblocksDevtools = {
      tag: "beerpong-replay",
      state: {
        ballsRemaining: MAX_BALLS,
        cupsScored: 0,
        ballsUsed: 0,
        gameOver: false,
        replayCount: 0,
      },
    };

    this.statusOverlay = new xb.UIOverlay({
      appearance: "none",
      pointerEvents: "auto",
      style: {
        width: 620,
        position: "absolute",
        top: 22,
        left: "50%",
        transform: {translateX: "-50%"},
      },
      children: [statusPanel],
    });
    this.statusOverlay.name = "Beerpong status";
    this.add(this.statusOverlay);

    this.resultTitle = new xb.UIText({
      text: "",
      style: {
        fontSize: 40,
        fontWeight: "bold",
        color: "#ffffff",
        textAlign: "center",
      },
    });
    this.resultDetail = new xb.UIText({
      text: "",
      style: {
        fontSize: 23,
        color: "#e8ecf4",
        textAlign: "center",
      },
    });
    this.resultPanel = new xb.UIPanel({
      style: {
        width: 470,
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: 22,
        backgroundColor: "#0d1429ed",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "#ffffff55",
      },
      children: [this.resultTitle, this.resultDetail],
    });
    this.resultPanel.visible = false;
    this.resultOverlay = new xb.UIOverlay({
      appearance: "none",
      pointerEvents: "none",
      style: {
        width: 520,
        position: "absolute",
        top: "38%",
        left: "50%",
        transform: {translateX: "-50%"},
      },
      children: [this.resultPanel],
    });
    this.resultOverlay.name = "Beerpong result";
    this.add(this.resultOverlay);

    this.instructions = new xb.UIText({
      text: "Pinch to grab a ball. Open your hand to throw.",
      style: {
        fontSize: 18,
        color: "#ffffffcc",
        textAlign: "center",
      },
    });
    this.instructionsOverlay = new xb.UIOverlay({
      appearance: "none",
      pointerEvents: "none",
      style: {
        width: 620,
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: {translateX: "-50%"},
      },
      children: [this.instructions],
    });
    this.instructionsOverlay.name = "Beerpong instructions";
    this.add(this.instructionsOverlay);
  }

  onSimulatorStarted() {
    this.beginCupPlacement();
  }

  onXRSessionStarted() {
    this.beginCupPlacement();
  }

  async beginCupPlacement() {
    if (this.placementStarted) return;
    this.placementStarted = true;

    // Let the engine finish setting up the world / initial camera transform.
    await new Promise((resolve) => setTimeout(resolve, 0));

    let placed = false;
    try {
      placed = await xb.world.placeOnHorizontalSurface(
        this.cupsRoot,
        {seconds: 2.0},
        9
      );
    } catch (error) {
      console.warn("Beerpong surface placement failed.", error);
    }

    if (!placed) {
      this.usingFallbackSurface = true;
      this.placeCupsOnFallbackTable();
    }

    this.placementFinished = true;
    this.cupsRoot.visible = true;
    this.rebuildCupColliders();
    this.ensureCupSurfaceCollider();
    this.syncExposedState();
  }

  placeCupsOnFallbackTable() {
    const camera = xb.core?.camera;
    const position = new THREE.Vector3(0, 0.82, -1.05);
    let yaw = 0;
    if (camera) {
      camera.getWorldPosition(this.scratchA);
      camera.getWorldDirection(this.scratchB);
      this.scratchB.y = 0;
      if (this.scratchB.lengthSq() < 0.0001) this.scratchB.set(0, 0, -1);
      this.scratchB.normalize();
      position.copy(this.scratchA).addScaledVector(this.scratchB, 1.02);
      position.y = Math.max(0.65, this.scratchA.y - 0.72);
      yaw = Math.atan2(this.scratchB.x, this.scratchB.z);
    }
    this.cupsRoot.position.copy(position);
    this.cupsRoot.rotation.set(0, yaw, 0);

    // Create a visible table only when no horizontal surface was available.
    // This keeps the fallback self-contained and physically coherent instead
    // of leaving the cups floating in space.
    if (!this.fallbackTable) {
      this.fallbackTable = new THREE.Group();
      this.fallbackTable.name = "Fallback beerpong table";
      const topMaterial = new THREE.MeshStandardMaterial({
        color: 0x7b4b2a,
        roughness: 0.72,
        metalness: 0.02,
      });
      const legMaterial = new THREE.MeshStandardMaterial({
        color: 0x3b2618,
        roughness: 0.8,
      });
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.035, 40),
        topMaterial
      );
      top.castShadow = true;
      top.receiveShadow = true;
      top.position.y = -0.0175;
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.10, position.y, 20),
        legMaterial
      );
      leg.position.y = -position.y * 0.5 - 0.035;
      leg.castShadow = true;
      this.fallbackTable.add(top, leg);
      this.fallbackTable.position.copy(position);
      this.fallbackTable.rotation.y = yaw;
      this.add(this.fallbackTable);
    }
  }

  addFallbackRoomColliders() {
    if (!this.physics) return;
    // The fallback floor and room boundaries are intentionally broad and
    // invisible. Detected planes/depth mesh, when present, remain the primary
    // physical surfaces; these guarantee that a thrown ball always has room
    // geometry to bounce from and can never be lost in an empty physics world.
    this.createFixedBox(
      new THREE.Vector3(10, 0.08, 10),
      new THREE.Vector3(0, -0.09, 0)
    );
    this.createFixedBox(
      new THREE.Vector3(0.1, 2.6, 5),
      new THREE.Vector3(4.1, 2.45, 0)
    );
    this.createFixedBox(
      new THREE.Vector3(0.1, 2.6, 5),
      new THREE.Vector3(-4.1, 2.45, 0)
    );
    this.createFixedBox(
      new THREE.Vector3(5, 2.6, 0.1),
      new THREE.Vector3(0, 2.45, 4.1)
    );
    this.createFixedBox(
      new THREE.Vector3(5, 2.6, 0.1),
      new THREE.Vector3(0, 2.45, -4.1)
    );
  }

  createFixedBox(halfExtents, position, quaternion) {
    if (!this.physics || !this.RAPIER) return null;
    const bodyDesc = this.RAPIER.RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y,
      position.z
    );
    if (quaternion) {
      bodyDesc.setRotation({
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
      });
    }
    const body = this.physics.blendedWorld.createRigidBody(bodyDesc);
    this.physics.blendedWorld.createCollider(
      this.RAPIER.ColliderDesc.cuboid(
        halfExtents.x,
        halfExtents.y,
        halfExtents.z
      )
        .setFriction(0.78)
        .setRestitution(0.28),
      body
    );
    this.environmentBodies.push(body);
    return body;
  }

  refreshPlaneColliders() {
    if (!this.physics || !this.RAPIER) return;
    const planes = xb.world?.planes?.get?.() ?? [];
    for (const plane of planes) {
      if (this.planeColliderBodies.has(plane.uuid)) continue;
      const body = this.createPlaneCollider(plane);
      if (body) this.planeColliderBodies.set(plane.uuid, body);
    }
  }

  createPlaneCollider(plane) {
    try {
      plane.updateWorldMatrix(true, false);
      const geometry = plane.geometry;
      const position = geometry?.attributes?.position;
      if (!position || position.count < 3) return null;

      const vertices = new Float32Array(position.count * 3);
      const vertex = new THREE.Vector3();
      for (let index = 0; index < position.count; index += 1) {
        vertex.fromBufferAttribute(position, index).applyMatrix4(plane.matrixWorld);
        vertices[index * 3] = vertex.x;
        vertices[index * 3 + 1] = vertex.y;
        vertices[index * 3 + 2] = vertex.z;
      }

      let indices;
      if (geometry.index && geometry.index.count >= 3) {
        indices = new Uint32Array(geometry.index.count);
        for (let index = 0; index < geometry.index.count; index += 1) {
          indices[index] = geometry.index.getX(index);
        }
      } else {
        indices = new Uint32Array(position.count);
        for (let index = 0; index < position.count; index += 1) {
          indices[index] = index;
        }
      }

      const body = this.physics.blendedWorld.createRigidBody(
        this.RAPIER.RigidBodyDesc.fixed()
      );
      this.physics.blendedWorld.createCollider(
        this.RAPIER.ColliderDesc.trimesh(vertices, indices)
          .setFriction(0.72)
          .setRestitution(0.32),
        body
      );
      this.environmentBodies.push(body);
      return body;
    } catch (error) {
      console.warn("Could not create detected-plane collider.", error);
      return null;
    }
  }

  ensureCupSurfaceCollider() {
    if (!this.physics || !this.RAPIER || this.cupSurfaceBody) return;
    this.cupsRoot.updateWorldMatrix(true, false);
    this.cupsRoot.getWorldPosition(this.scratchA);
    this.cupsRoot.getWorldQuaternion(this.scratchQuat);
    this.cupSurfaceBody = this.createFixedBox(
      new THREE.Vector3(0.31, 0.014, 0.31),
      new THREE.Vector3(this.scratchA.x, this.scratchA.y - 0.015, this.scratchA.z),
      this.scratchQuat
    );
  }

  rebuildCupColliders() {
    if (!this.physics || !this.RAPIER) return;
    for (const body of this.cupColliderBodies) {
      try {
        this.physics.blendedWorld.removeRigidBody(body);
      } catch (error) {
        // The world may already be disposing. The app is still safe to reset.
      }
    }
    this.cupColliderBodies = [];

    for (const cup of this.cups) {
      const body = this.createCupCollider(cup);
      if (body) this.cupColliderBodies.push(body);
    }
  }

  createCupCollider(cup) {
    const world = this.physics.blendedWorld;
    cup.group.updateWorldMatrix(true, false);
    cup.group.getWorldPosition(this.scratchA);
    cup.group.getWorldQuaternion(this.scratchQuat);

    const body = world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed()
        .setTranslation(this.scratchA.x, this.scratchA.y, this.scratchA.z)
        .setRotation({
          x: this.scratchQuat.x,
          y: this.scratchQuat.y,
          z: this.scratchQuat.z,
          w: this.scratchQuat.w,
        })
    );

    // Cup bottom, solid enough for a ball to land in.
    world.createCollider(
      this.RAPIER.ColliderDesc.cylinder(0.006, CUP_BOTTOM_RADIUS - 0.002)
        .setTranslation(0, 0.006, 0)
        .setFriction(0.82)
        .setRestitution(0.18),
      body
    );

    // Open ring made from thin overlapping wall segments. This gives the cup
    // a real open mouth while still producing visible bounces off its rim.
    const segments = 16;
    const centerRadius =
      (CUP_TOP_RADIUS + CUP_BOTTOM_RADIUS) * 0.5 - CUP_WALL_THICKNESS * 0.4;
    const segmentWidth =
      ((2 * Math.PI * centerRadius) / segments) * 0.72;
    const segmentQuat = new THREE.Quaternion();
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      segmentQuat.setFromEuler(new THREE.Euler(0, angle - Math.PI / 2, 0));
      world.createCollider(
        this.RAPIER.ColliderDesc.cuboid(
          CUP_WALL_THICKNESS * 0.5,
          CUP_HEIGHT * 0.5,
          segmentWidth
        )
          .setTranslation(
            Math.sin(angle) * centerRadius,
            CUP_HEIGHT * 0.5,
            Math.cos(angle) * centerRadius
          )
          .setRotation({
            x: segmentQuat.x,
            y: segmentQuat.y,
            z: segmentQuat.z,
            w: segmentQuat.w,
          })
          .setFriction(0.62)
          .setRestitution(0.32),
        body
      );
    }
    return body;
  }

  update(time, frame) {
    if (
      !this.placementStarted &&
      (xb.core?.simulator || xb.core?.renderer?.xr?.isPresenting)
    ) {
      this.beginCupPlacement();
    }
    this.refreshPlaneColliders();
    this.sampleHandsAndHandlePinches(time);
    this.updateHeldBalls();
    this.removeExpiredVisualBalls();
    this.updateUiState();
  }

  sampleHandsAndHandlePinches(time) {
    const now =
      typeof time === "number" && Number.isFinite(time)
        ? time
        : performance.now();
    const controllers = xb.user?.input?.controllers;

    for (let handIndex = 0; handIndex < 2; handIndex += 1) {
      const state = this.handState[handIndex];
      const anchor = this.getHandAnchor(handIndex, this.scratchB);
      const controller = controllers?.[handIndex];
      const selecting = controller?.userData?.selected === true;

      if (anchor) {
        state.anchor.copy(anchor);
        if (state.hasAnchor && state.lastSampleMs > 0) {
          const dt = Math.max(
            0.001,
            Math.min(0.12, (now - state.lastSampleMs) / 1000)
          );
          this.scratchC
            .copy(state.anchor)
            .sub(state.previousAnchor)
            .divideScalar(dt);
          if (isFiniteVector(this.scratchC)) {
            if (this.scratchC.length() > 12) this.scratchC.setLength(12);
            state.velocity.lerp(this.scratchC, Math.min(1, dt * 30));
          }
        }
        state.previousAnchor.copy(state.anchor);
        state.hasAnchor = true;
        state.lastSampleMs = now;
      }

      if (selecting && !state.selecting) {
        this.onHandPinchStarted(handIndex);
      } else if (!selecting && state.selecting) {
        this.onHandPinchEnded(handIndex);
      }
      state.selecting = selecting;
    }
  }

  getHandAnchor(handIndex, target) {
    if (!target) target = new THREE.Vector3();
    const hands = xb.user?.hands;
    const xrHand = hands?.hands?.[handIndex];
    const joints = xrHand?.joints;
    const wrist = joints?.["wrist"];
    const indexTip = joints?.["index-finger-tip"];
    const thumbTip = joints?.["thumb-tip"];

    if (wrist && indexTip) {
      wrist.getWorldPosition(this.scratchA);
      indexTip.getWorldPosition(this.scratchB);
      target.lerpVectors(this.scratchA, this.scratchB, 0.58);
    } else if (wrist) {
      wrist.getWorldPosition(target);
    } else if (indexTip) {
      indexTip.getWorldPosition(target);
    } else {
      const controller = xb.user?.input?.controllers?.[handIndex];
      if (!controller) return null;
      controller.getWorldPosition(target);
    }

    if (thumbTip && indexTip) {
      thumbTip.getWorldPosition(this.scratchA);
      indexTip.getWorldPosition(this.scratchB);
      this.scratchC.lerpVectors(this.scratchA, this.scratchB, 0.5);
      target.lerp(this.scratchC, 0.35);
    }
    return target;
  }

  onHandPinchStarted(handIndex) {
    if (this.gameOver) return;
    if (this.heldBalls.has(handIndex)) return;
    const ballsRemaining = MAX_BALLS - this.ballsUsed;
    if (ballsRemaining - this.heldBalls.size <= 0) return;

    const state = this.handState[handIndex];
    const ball = new THREE.Mesh(this.ballGeometry, this.ballMaterial);
    ball.name = "Beerpong ball";
    ball.castShadow = true;
    ball.receiveShadow = true;
    ball.userData.xrblocksDevtools = {
      tag: "beerpong-ball",
      state: {
        status: "held",
        hand: handIndex === 0 ? "left" : "right",
        ballId: `${Date.now()}-${handIndex}`,
      },
    };

    const position = state.hasAnchor ? state.anchor : this.scratchB;
    ball.position.copy(position);
    this.add(ball);

    this.heldBalls.set(handIndex, {mesh: ball, handIndex});
    this.syncExposedState();
  }

  onHandPinchEnded(handIndex) {
    const held = this.heldBalls.get(handIndex);
    if (!held) return;
    this.heldBalls.delete(handIndex);

    const state = this.handState[handIndex];
    const position = held.mesh.position.clone();
    const velocity = state.velocity.clone();
    if (!isFiniteVector(velocity)) velocity.set(0, 0, 0);
    if (velocity.length() > 9) velocity.setLength(9);

    if (!this.physics || !this.RAPIER) {
      // If initialization is still in flight, a visual release is still
      // better than leaving a stale held ball. It will be removed on replay.
      this.releaseVisualOnlyBall(held.mesh, velocity);
      return;
    }

    const body = this.physics.blendedWorld.createRigidBody(
      this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setLinearDamping(0.04)
        .setAngularDamping(0.18)
        .setCcdEnabled(true)
    );
    const collider = this.physics.blendedWorld.createCollider(
      this.RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setFriction(0.62)
        .setRestitution(0.52)
        .setDensity(0.075),
      body
    );

    held.mesh.userData.xrblocksDevtools.state = {
      status: "released",
      hand: handIndex === 0 ? "left" : "right",
      releaseSpeed: velocity.length(),
    };

    this.releasedBalls.push({
      mesh: held.mesh,
      body,
      collider,
      handIndex,
      releasedAt: performance.now(),
      lastPosition: position.clone(),
    });

    this.ballsUsed += 1;
    this.updateUiState();
    this.checkRoundEnd();
    this.syncExposedState();
  }

  releaseVisualOnlyBall(mesh, velocity) {
    this.ballsUsed += 1;
    this.releasedBalls.push({
      mesh,
      body: null,
      collider: null,
      handIndex: -1,
      releasedAt: performance.now(),
      lastPosition: mesh.position.clone(),
      visualVelocity: velocity,
    });
    this.updateUiState();
    this.checkRoundEnd();
  }

  updateHeldBalls() {
    for (const [handIndex, held] of this.heldBalls) {
      const anchor = this.getHandAnchor(handIndex, this.scratchB);
      if (anchor) held.mesh.position.copy(anchor);
    }
  }

  physicsStep() {
    if (!this.physics) return;
    const now = performance.now();

    for (const ball of [...this.releasedBalls]) {
      if (!ball.body) {
        if (ball.visualVelocity) {
          const dt = 1 / Math.max(1, this.physics.fps || 45);
          ball.mesh.position.addScaledVector(ball.visualVelocity, dt);
          ball.visualVelocity.y -= 9.81 * dt;
        }
        if (now - ball.releasedAt > BALL_LIFETIME_MS) {
          this.resolveBall(ball, "miss");
        }
        continue;
      }

      const translation = ball.body.translation();
      const rotation = ball.body.rotation();
      const previous = ball.lastPosition;
      ball.mesh.position.set(translation.x, translation.y, translation.z);
      ball.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

      if (this.tryScoreBall(ball, previous, ball.mesh.position)) {
        continue;
      }

      ball.lastPosition.copy(ball.mesh.position);
      const distanceFromCups = ball.mesh.position.distanceTo(
        this.cupsRoot.getWorldPosition(this.scratchA)
      );
      if (
        now - ball.releasedAt > BALL_LIFETIME_MS ||
        ball.mesh.position.y < -1.2 ||
        distanceFromCups > BALL_MAX_DISTANCE_FROM_CUPS
      ) {
        this.resolveBall(ball, "miss");
      }
    }
  }

  tryScoreBall(ball, previous, current) {
    for (const cup of this.cups) {
      if (cup.scored) continue;
      cup.group.updateWorldMatrix(true, false);
      this.scratchMatrix.copy(cup.group.matrixWorld).invert();

      this.scratchA.copy(previous).applyMatrix4(this.scratchMatrix);
      this.scratchB.copy(current).applyMatrix4(this.scratchMatrix);

      const maxY = CUP_HEIGHT + BALL_RADIUS;
      let scored = false;
      const sampleCount = 6;
      for (let sample = 0; sample <= sampleCount; sample += 1) {
        const t = sample / sampleCount;
        this.scratchC.lerpVectors(this.scratchA, this.scratchB, t);
        const radius = Math.hypot(this.scratchC.x, this.scratchC.z);
        if (
          this.scratchC.y >= -BALL_RADIUS * 0.35 &&
          this.scratchC.y <= maxY &&
          radius <= CUP_INNER_RADIUS - 0.006
        ) {
          scored = true;
          break;
        }
      }

      if (scored) {
        this.scoreCup(cup);
        this.resolveBall(ball, "score");
        return true;
      }
    }
    return false;
  }

  scoreCup(cup) {
    if (cup.scored) return;
    cup.scored = true;
    this.cupsScored += 1;
    cup.bodyMaterial.color.setHex(0x65e38c);
    cup.bodyMaterial.emissive.setHex(0x0b3d23);
    cup.bodyMaterial.emissiveIntensity = 0.65;
    cup.stripeMaterial.color.setHex(0x2c8b57);
    cup.group.userData.xrblocksDevtools.state.scored = true;
    this.updateUiState();
    this.updateReplayState();
  }

  resolveBall(ball, reason) {
    const index = this.releasedBalls.indexOf(ball);
    if (index >= 0) this.releasedBalls.splice(index, 1);

    if (ball.body && this.physics) {
      try {
        this.physics.blendedWorld.removeRigidBody(ball.body);
      } catch (error) {
        // Ignore removal races during teardown/replay.
      }
    }
    ball.mesh.removeFromParent();

    this.syncExposedState();
    this.checkRoundEnd();
  }

  checkRoundEnd() {
    if (this.gameOver) return;
    if (this.cupsScored >= CUP_COUNT) {
      this.showResult("win");
      return;
    }
    if (this.ballsUsed >= MAX_BALLS && this.releasedBalls.length === 0) {
      this.showResult("loss");
    }
  }

  showResult(result) {
    if (this.gameOver) return;
    this.gameOver = true;
    // Any ball still pinched when the round ends is part of the finished
    // round. Drop it from the scene without changing the final ball count.
    for (const held of this.heldBalls.values()) {
      held.mesh.removeFromParent();
    }
    this.heldBalls.clear();
    this.resultPanel.visible = true;
    if (result === "win") {
      this.resultTitle.text = "You win!";
      const remaining = Math.max(0, MAX_BALLS - this.ballsUsed);
      this.resultDetail.text = `${this.cupsScored} cups scored · ${remaining} ball${
        remaining === 1 ? "" : "s"
      } remaining`;
    } else {
      this.resultTitle.text = "You lose";
      this.resultDetail.text = `${this.cupsScored} cup${
        this.cupsScored === 1 ? "" : "s"
      } scored`;
    }
    this.updateUiState(true);
    this.updateReplayState();
    this.syncExposedState();
  }

  replay() {
    this.replayCount += 1;
    // Remove every active ball, whether it is still held or already dynamic.
    for (const held of this.heldBalls.values()) {
      held.mesh.removeFromParent();
    }
    this.heldBalls.clear();

    for (const ball of [...this.releasedBalls]) {
      if (ball.body && this.physics) {
        try {
          this.physics.blendedWorld.removeRigidBody(ball.body);
        } catch (error) {
          // Ignore cleanup races.
        }
      }
      ball.mesh.removeFromParent();
    }
    this.releasedBalls = [];

    for (const cup of this.cups) {
      cup.scored = false;
      cup.bodyMaterial.color.setHex(0xf7f5ef);
      cup.bodyMaterial.emissive.setHex(0x000000);
      cup.bodyMaterial.emissiveIntensity = 0;
      cup.stripeMaterial.color.setHex(0xd93a32);
      cup.group.userData.xrblocksDevtools.state.scored = false;
    }

    this.ballsUsed = 0;
    this.cupsScored = 0;
    this.gameOver = false;
    this.resultPanel.visible = false;
    this.resultTitle.text = "";
    this.resultDetail.text = "";
    this.updateUiState(true);
    this.syncExposedState();
  }

  updateUiState(force = false) {
    const remaining = Math.max(0, MAX_BALLS - this.ballsUsed);
    const ballsLabel = `${remaining} ball${remaining === 1 ? "" : "s"} remaining`;
    const cupsLabel = `${this.cupsScored} cup${
      this.cupsScored === 1 ? "" : "s"
    } scored`;
    const key = `${ballsLabel}|${cupsLabel}|${this.gameOver}|${this.resultPanel?.visible}`;
    if (!force && key === this.lastUiStateKey) return;
    this.lastUiStateKey = key;

    if (this.ballsText) this.ballsText.text = ballsLabel;
    if (this.cupsText) this.cupsText.text = cupsLabel;
    this.updateReplayState();
  }

  updateReplayState() {
    if (!this.replayButton) return;
    this.replayButton.userData.xrblocksDevtools.state = {
      ballsRemaining: Math.max(0, MAX_BALLS - this.ballsUsed),
      cupsScored: this.cupsScored,
      ballsUsed: this.ballsUsed,
      gameOver: this.gameOver,
      activeBalls: this.heldBalls.size + this.releasedBalls.length,
      replayCount: this.replayCount,
    };
  }

  syncExposedState() {
    window.__digitalBeerpongState = {
      ballsRemaining: Math.max(0, MAX_BALLS - this.ballsUsed),
      cupsScored: this.cupsScored,
      ballsUsed: this.ballsUsed,
      heldBalls: this.heldBalls.size,
      activeReleasedBalls: this.releasedBalls.length,
      gameOver: this.gameOver,
      placementFinished: this.placementFinished,
      usingFallbackSurface: this.usingFallbackSurface,
    };
    if (this.replayButton) this.updateReplayState();
  }

  removeExpiredVisualBalls() {
    if (this.physics) return;
    const now = performance.now();
    for (const ball of [...this.releasedBalls]) {
      if (!ball.body && now - ball.releasedAt > BALL_LIFETIME_MS) {
        this.resolveBall(ball, "miss");
      }
    }
  }

  dispose() {
    for (const body of this.cupColliderBodies) {
      try {
        this.physics?.blendedWorld.removeRigidBody(body);
      } catch (error) {}
    }
    for (const body of this.environmentBodies) {
      try {
        this.physics?.blendedWorld.removeRigidBody(body);
      } catch (error) {}
    }
    for (const held of this.heldBalls.values()) held.mesh.removeFromParent();
    for (const ball of this.releasedBalls) ball.mesh.removeFromParent();
    this.heldBalls.clear();
    this.releasedBalls = [];
    for (const cup of this.cups) {
      cup.bodyMaterial.dispose();
      cup.stripeMaterial.dispose();
    }
    this.fallbackTable?.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        for (const material of object.material) material.dispose?.();
      } else {
        object.material?.dispose?.();
      }
    });
    this.cupGeometry.dispose();
    this.cupBottomGeometry.dispose();
    this.cupRimGeometry.dispose();
    this.cupStripeGeometry.dispose();
    this.ballGeometry.dispose();
    this.ballMaterial.dispose();
    delete window.__digitalBeerpong;
    delete window.__digitalBeerpongState;
  }
}

const options = new xb.Options();
options.physics.RAPIER = RAPIER;
options.enableHands();
options.hands.visualization = true;
options.enablePlaneDetection();
options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.simulator.defaultMode = xb.SimulatorMode.POSE;
options.xrButton.showEnterSimulatorButton = true;
options.xrButton.appTitle = "Digital Beerpong";
options.xrButton.appDescription =
  "Pinch to spawn a ball, open your hand to throw, and clear all six cups.";

document.addEventListener("DOMContentLoaded", () => {
  xb.add(new DigitalBeerpong());
  xb.init(options);
});
