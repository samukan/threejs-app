import './style.css';

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {VRButton} from 'three/addons/webxr/VRButton.js';
import {XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import {RapierPhysics} from 'three/addons/physics/RapierPhysics.js';
import {RapierHelper} from 'three/addons/helpers/RapierHelper.js';
import Stats from 'three/addons/libs/stats.module.js';

// Globals
let camera, scene, renderer, controls, stats;
let controller1, controller2, controllerGrip1, controllerGrip2;
let raycaster;
const intersected = [];
const tempMatrix = new THREE.Matrix4();
let group;
let physics, physicsHelper;
let teleportMarker;
const tempVec = new THREE.Vector3();

const excludedObjects = ['maa_2'];

let groundMesh = null; // Store reference to ground for physics

init();

const ASSET_BASE = import.meta.env.BASE_URL || '/';
// Use HDRLoader
new HDRLoader().setPath(`${ASSET_BASE}equirectangular/textures/`).load(
  'lakeside_sunrise_1k.hdr',
  function (hdrTexture) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    // Convert the loaded HDR equirectangular texture into a prefiltered env map for PBR
    const envMap = pmrem.fromEquirectangular(hdrTexture).texture;
    hdrTexture.dispose();
    pmrem.dispose();

    scene.environment = envMap;
    scene.background = envMap;

    // 1) Ground
    const groundLoader = new GLTFLoader().setPath(`${ASSET_BASE}landscape/`);
    groundLoader.load(
      'maa_2.glb',
      async function (gltf) {
        const ground = gltf.scene;

        // Optional precompile
        if (renderer.compileAsync) {
          try {
            await renderer.compileAsync(ground, camera, scene);
          } catch (e) {
            console.warn('compileAsync not available or failed:', e);
          }
        }

        ground.position.set(0, 0, 0);

        // Traverse the model to enable shadows and prepare materials
        ground.traverse(function (node) {
          if (node.isMesh) {
            if (node.material) {
              // Clone material to avoid shared material issues
              node.material = node.material.clone();
              node.material.side = THREE.DoubleSide;

              // Reset emissive to black for highlighting
              if (node.material.emissive) {
                node.material.emissive.setHex(0x000000);
              } else {
                node.material.emissive = new THREE.Color(0x000000);
              }
            }
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        groundMesh = ground;
        group.add(ground);

        // Initialize physics after ground is loaded
        if (physics) {
          physics.addMesh(ground, 0); // mass 0 = static
        }

        console.log('Ground (maa.glb) loaded with shadows enabled');
        console.log(
          'To see all object names, check ground.children:',
          ground.children
        );
      },
      undefined,
      function (err) {
        console.error('Failed to load ground (maa_2.glb):', err);
      }
    );

    // 2) Bottle - position above ground after loading
    const bottleLoader = new GLTFLoader().setPath(`${ASSET_BASE}bottle/`);
    bottleLoader.load(
      'WaterBottle.gltf',
      async function (gltf) {
        const model = gltf.scene;

        if (renderer.compileAsync) {
          try {
            await renderer.compileAsync(model, camera, scene);
          } catch (e) {
            console.warn('compileAsync not available or failed:', e);
          }
        }

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Center the model at origin first
        model.position.set(-center.x, -box.min.y, -center.z);

        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 5) {
          const scale = 5 / maxDim;
          model.scale.setScalar(scale);
        }

        model.position.set(0.5, 1.5, -1);

        model.traverse(function (node) {
          if (node.isMesh) {
            if (node.material) {
              node.material = node.material.clone();
              node.material.side = THREE.DoubleSide;

              if (node.material.emissive) {
                node.material.emissive.setHex(0x000000);
              } else {
                node.material.emissive = new THREE.Color(0x000000);
              }

              if (node.material.emissiveIntensity === undefined) {
                node.material.emissiveIntensity = 1.0;
              }
            }
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        group.add(model);

        // Add physics to bottle
        if (physics) {
          physics.addMesh(model, 1, 0.3); // mass 1, friction 0.3
        }

        console.log('Bottle loaded with shadows enabled and physics');
        console.log('Group now has', group.children.length, 'children');
        console.log('Model added to group:', model.name, model.type);

        controls.target.set(0, 0, 0);
        controls.update();
      },
      undefined,
      function (err) {
        console.error('Failed to load bottle GLTF:', err);
      }
    );
  },
  undefined,
  function (err) {
    console.error('Failed to load HDRI:', err);
  }
);

async function init() {
  // Scene
  scene = new THREE.Scene();

  // Create group for interactive objects
  group = new THREE.Group();
  scene.add(group);

  // Add a test cube to the group for debugging VR interaction
  const testGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const testMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: new THREE.Color(0x000000),
    roughness: 0.7,
    metalness: 0.0,
  });
  const testCube = new THREE.Mesh(testGeometry, testMaterial);
  testCube.position.set(0, 1.5, -1); // In front of camera at eye level
  testCube.castShadow = true;
  testCube.receiveShadow = true;
  testCube.name = 'TestCube';
  group.add(testCube);
  console.log('Test cube added to group at position:', testCube.position);

  // Add physics to test cube
  if (physics) {
    physics.addMesh(testCube, 1, 0.2); // mass 1, friction 0.2
  }

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(2, 2, 5);

  // Renderer
  renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Enable shadows
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: for softer shadows

  const app = document.getElementById('app') || document.body;
  app.appendChild(renderer.domElement);

  // Enable WebXR on the renderer and add the VR button
  renderer.xr.enabled = true;
  document.body.appendChild(VRButton.createButton(renderer));

  // Initialize Stats
  stats = new Stats();
  document.body.appendChild(stats.dom);

  // Initialize physics
  await initPhysics();

  // Listen for VR session start/end
  renderer.xr.addEventListener('sessionstart', () => {
    console.log('VR session started');
    console.log('Group has', group.children.length, 'children');
    console.log('Controller1:', controller1);
    console.log('Controller2:', controller2);
  });

  renderer.xr.addEventListener('sessionend', () => {
    console.log('VR session ended');
  });

  // Helpers
  const axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  // Lights
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(5, 10, 7.5);

  // Enable shadow casting for directional light
  directionalLight.castShadow = true;

  // Configure shadow properties
  directionalLight.shadow.mapSize.set(4096, 4096);
  directionalLight.shadow.normalBias = 0.05;
  directionalLight.shadow.bias = -0.001;

  // Configure shadow camera
  directionalLight.shadow.camera.top = 10;
  directionalLight.shadow.camera.bottom = -10;
  directionalLight.shadow.camera.left = -10;
  directionalLight.shadow.camera.right = 10;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 50;

  scene.add(directionalLight);

  // Add shadow camera helper
  const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
  scene.add(shadowHelper);

  const ambient = new THREE.AmbientLight(0x404040, 1.1);
  scene.add(ambient);

  const point = new THREE.PointLight(0xfff2cc, 0.6, 0, 2);
  point.position.set(-3, 2, 3);
  scene.add(point);

  // Orbit Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.update();

  // XR Controllers with 3D models
  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onSelectStart);
  controller1.addEventListener('selectend', onSelectEnd);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onSelectStart);
  controller2.addEventListener('selectend', onSelectEnd);
  scene.add(controller2);

  // Controller grips (hands) with 3D models
  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(
    controllerModelFactory.createControllerModel(controllerGrip1)
  );
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(
    controllerModelFactory.createControllerModel(controllerGrip2)
  );
  scene.add(controllerGrip2);

  // Add ray/pointer lines to controllers
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const line1 = new THREE.Line(lineGeometry);
  line1.name = 'line';
  line1.scale.z = 5;
  controller1.add(line1);

  const line2 = new THREE.Line(lineGeometry.clone());
  line2.name = 'line';
  line2.scale.z = 5;
  controller2.add(line2);

  // Raycaster for controller interaction
  raycaster = new THREE.Raycaster();

  // Start render loop
  renderer.setAnimationLoop(animate);

  // Setup teleportation
  setupTeleportation();

  // Events
  window.addEventListener('resize', onWindowResize, false);
}

async function initPhysics() {
  physics = await RapierPhysics();
  physics.addScene(scene);

  // Add physics helper for debugging
  physicsHelper = new RapierHelper(physics.world);
  scene.add(physicsHelper);

  console.log('Physics initialized');
}

function setupTeleportation() {
  // Create teleport marker (a ring/disc on the ground)
  const markerGeometry = new THREE.RingGeometry(0.25, 0.35, 32);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  });
  teleportMarker = new THREE.Mesh(markerGeometry, markerMaterial);
  teleportMarker.rotation.x = -Math.PI / 2; // Lay flat
  teleportMarker.visible = false;
  scene.add(teleportMarker);

  // Add squeeze event listeners for teleportation
  controller1.addEventListener('squeezestart', onSqueezeStart);
  controller1.addEventListener('squeezeend', onSqueezeEnd);
  controller2.addEventListener('squeezestart', onSqueezeStart);
  controller2.addEventListener('squeezeend', onSqueezeEnd);

  console.log('Teleportation system initialized');
}

function onSqueezeStart(event) {
  const controller = event.target;
  controller.userData.teleporting = true;
  teleportMarker.visible = true;
  console.log('Teleport mode activated');
}

function onSqueezeEnd(event) {
  const controller = event.target;
  controller.userData.teleporting = false;

  if (teleportMarker.visible && teleportMarker.userData.validLocation) {
    // Teleport the camera rig
    const offset = renderer.xr.getCamera().position.clone();
    offset.y = 0; // Only offset XZ, keep Y

    const newPosition = teleportMarker.position.clone().sub(offset);
    newPosition.y = camera.position.y; // Maintain current height

    // Move the entire XR reference space
    const offsetPosition = {
      x: -newPosition.x,
      y: -newPosition.y,
      z: -newPosition.z,
      w: 1,
    };

    // Get the base reference space and apply offset
    const session = renderer.xr.getSession();
    if (session) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const offsetTransform = new XRRigidTransform(offsetPosition);
      const newReferenceSpace =
        referenceSpace.getOffsetReferenceSpace(offsetTransform);
      renderer.xr.setReferenceSpace(newReferenceSpace);
      console.log('Teleported to:', teleportMarker.position);
    }
  }

  teleportMarker.visible = false;
  console.log('Teleport mode deactivated');
}

function updateTeleportMarker(controller) {
  if (!controller.userData.teleporting) return;

  // Cast ray from controller to find ground
  controller.updateMatrixWorld();
  raycaster.setFromXRController(controller);

  // Check intersection with ground
  const intersects = raycaster.intersectObjects([groundMesh], true);

  if (intersects.length > 0) {
    const hit = intersects[0];
    teleportMarker.position.copy(hit.point);
    teleportMarker.userData.validLocation = true;
    teleportMarker.material.color.setHex(0x00ff00); // Green for valid
  } else {
    teleportMarker.userData.validLocation = false;
    teleportMarker.material.color.setHex(0xff0000); // Red for invalid
  }
}

function animate() {
  // Remove fallen objects
  if (physics) {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const mesh = group.children[i];
      if (mesh.position.y < -10) {
        physics.removeMesh(mesh);
        group.remove(mesh);
        scene.remove(mesh);
        console.log('Removed fallen object:', mesh.name);
      }
    }
  }

  // Update physics helper
  if (physicsHelper) {
    physicsHelper.update();
  }

  // Clean previously highlighted objects
  cleanIntersected();

  // Check for intersections and teleportation
  if (renderer.xr.isPresenting) {
    intersectObjects(controller1);
    intersectObjects(controller2);

    // Update teleport marker if in teleport mode
    if (controller1.userData.teleporting) {
      updateTeleportMarker(controller1);
    }
    if (controller2.userData.teleporting) {
      updateTeleportMarker(controller2);
    }
  }

  // update controls
  controls.update();

  // render
  renderer.render(scene, camera);

  // update stats
  if (stats) {
    stats.update();
  }
}

// Helper: get intersections from a controller
function getIntersections(controller) {
  controller.updateMatrixWorld();
  raycaster.setFromXRController(controller);
  const intersections = raycaster.intersectObjects(group.children, true);

  if (intersections.length > 0) {
    console.log('Found', intersections.length, 'intersections');
    console.log(
      'First intersection:',
      intersections[0].object.name,
      intersections[0].object.type
    );
  }

  return intersections;
}

function intersectObjects(controller) {
  if (controller.userData.targetRayMode === 'screen') return;
  if (controller.userData.selected !== undefined) return;

  const line = controller.getObjectByName('line');
  if (!line) {
    console.warn('No line found on controller');
    return;
  }

  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const intersection = intersections[0];
    let object = intersection.object;

    // Check if object is in exclusion list
    if (!excludedObjects.includes(object.name)) {
      // Find the root object in the group
      let rootObject = object;
      while (
        rootObject.parent &&
        rootObject.parent !== group &&
        rootObject.parent !== scene
      ) {
        rootObject = rootObject.parent;
      }

      // Highlight the root object's meshes
      rootObject.traverse(function (node) {
        if (node.isMesh && node.material && node.material.emissive) {
          node.material.emissive.r = 1;
          intersected.push(node);
        }
      });
    }

    // Scale line to intersection distance
    line.scale.z = intersection.distance;
  } else {
    line.scale.z = 5;
  }
}

// Helper: clear all highlighted objects
function cleanIntersected() {
  while (intersected.length) {
    const object = intersected.pop();
    if (object.material && object.material.emissive) {
      object.material.emissive.r = 0;
    }
  }
}

// Controller event: select start
function onSelectStart(event) {
  const controller = event.target;
  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const intersection = intersections[0];
    let object = intersection.object;

    console.log('Intersected object:', object.name, object.type);
    console.log('Object parent:', object.parent?.name, object.parent?.type);

    // Check if object is in exclusion list
    if (!excludedObjects.includes(object.name)) {
      let rootObject = object;
      while (
        rootObject.parent &&
        rootObject.parent !== group &&
        rootObject.parent !== scene
      ) {
        rootObject = rootObject.parent;
      }

      console.log('Root object found:', rootObject.name, rootObject.type);
      console.log(
        'Root object parent:',
        rootObject.parent?.name,
        rootObject.parent?.type
      );

      let highlightedCount = 0;
      rootObject.traverse(function (node) {
        if (node.isMesh) {
          console.log(
            'Mesh found:',
            node.name,
            'has material:',
            !!node.material,
            'has emissive:',
            !!node.material?.emissive
          );
          if (node.material && node.material.emissive) {
            node.material.emissive.b = 1;
            highlightedCount++;
            console.log(
              'Highlighted mesh:',
              node.name,
              'emissive:',
              node.material.emissive
            );
          }
        }
      });
      console.log('Total meshes highlighted:', highlightedCount);

      // Remove from physics while holding
      if (physics) {
        physics.removeMesh(rootObject);
      }

      // Convert hit point to controller local space
      const localPoint = controller.worldToLocal(
        tempVec.copy(intersection.point)
      );

      // Attach object to controller (for dragging)
      controller.add(rootObject);
      rootObject.position.copy(localPoint);
      controller.userData.selected = rootObject;

      console.log('Object attached to controller and removed from physics');
    } else {
      console.log('Object is in exclusion list');
    }
  }

  controller.userData.targetRayMode = event.data.targetRayMode;
}

function onSelectEnd(event) {
  const controller = event.target;

  if (controller.userData.selected !== undefined) {
    const object = controller.userData.selected;

    console.log('Releasing object:', object.name);

    // Remove highlight - traverse to unhighlight all meshes
    object.traverse(function (node) {
      if (node.isMesh && node.material && node.material.emissive) {
        node.material.emissive.b = 0;
      }
    });

    // Detach back to scene group
    scene.attach(object);
    group.add(object);

    // Re-add to physics with new global transform
    if (physics) {
      physics.addMesh(object, 1, 0.2);
    }

    controller.userData.selected = undefined;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
