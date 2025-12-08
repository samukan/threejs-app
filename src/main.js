import './style.css';

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {VRButton} from 'three/addons/webxr/VRButton.js';
import {XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';

// Globals
let camera, scene, renderer, controls;
let controller1, controller2, controllerGrip1, controllerGrip2;
let raycaster;
const intersected = [];
const tempMatrix = new THREE.Matrix4();
let group;

const excludedObjects = ['maa_2'];
const fallingObjects = [];

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
        ground.name = 'maa_2';

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

        group.add(ground);

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

        // 1. Scale the model first
        const boxRaw = new THREE.Box3().setFromObject(model);
        const sizeRaw = boxRaw.getSize(new THREE.Vector3());
        const maxDim = Math.max(sizeRaw.x, sizeRaw.y, sizeRaw.z);

        if (maxDim > 5) {
          const scale = 5 / maxDim;
          model.scale.setScalar(scale);
        }

        // 2. Calculate box of scaled model
        // We need to update the matrix world to get accurate bounding box after scaling
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());

        // 3. Create a wrapper group
        const wrapper = new THREE.Group();
        wrapper.name = 'WaterBottleWrapper';

        // 4. Position model inside wrapper so bottom is at (0,0,0)
        model.position.x = -center.x;
        model.position.y = -box.min.y;
        model.position.z = -center.z;
        model.name = 'WaterBottleModel';

        wrapper.add(model);

        // 5. Position wrapper in the scene
        wrapper.position.set(0.5, 1.5, -1);

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

        group.add(wrapper);

        console.log('Bottle loaded with shadows enabled');
        console.log('Group now has', group.children.length, 'children');
        console.log('Model added to group:', wrapper.name, wrapper.type);

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

function init() {
  // Scene
  scene = new THREE.Scene();

  // Create group for interactive objects
  group = new THREE.Group();
  scene.add(group);

  // Add a test cube to the group for debugging VR interaction
  const testGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  testGeometry.translate(0, 0.15, 0); // Move origin to bottom
  const testMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: new THREE.Color(0x000000),
    roughness: 0.7,
    metalness: 0.0,
  });
  const testCube = new THREE.Mesh(testGeometry, testMaterial);
  testCube.position.set(0, 0, -1); // On ground
  testCube.castShadow = true;
  testCube.receiveShadow = true;
  testCube.name = 'TestCube';
  group.add(testCube);
  console.log('Test cube added to group at position:', testCube.position);

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

  // Events
  window.addEventListener('resize', onWindowResize, false);
}

function animate() {
  // Clean previously highlighted objects
  cleanIntersected();

  // Update gravity
  updateGravity();

  // Check for intersections
  if (renderer.xr.isPresenting) {
    intersectObjects(controller1);
    intersectObjects(controller2);
  }

  // update controls
  controls.update();

  // render
  renderer.render(scene, camera);
}

// Helper: get intersections from a controller
function getIntersections(controller) {
  controller.updateMatrixWorld();
  raycaster.setFromXRController(controller);
  return raycaster.intersectObjects(group.children, true);
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

    // Find the root object in the group
    let rootObject = object;
    while (
      rootObject.parent &&
      rootObject.parent !== group &&
      rootObject.parent !== scene
    ) {
      rootObject = rootObject.parent;
    }

    // Check if object is in exclusion list
    if (!excludedObjects.includes(rootObject.name)) {
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

    console.log('Select Start: Intersected object:', object.name, object.type);

    // Find the root object in the group
    let rootObject = object;
    while (
      rootObject.parent &&
      rootObject.parent !== group &&
      rootObject.parent !== scene
    ) {
      rootObject = rootObject.parent;
    }

    console.log('Select Start: Root object determined:', rootObject.name);

    // Check if object is in exclusion list
    if (!excludedObjects.includes(rootObject.name)) {
      console.log('Select Start: Object is not excluded. Attaching...');

      // Attach object to controller (for dragging)
      controller.attach(rootObject);
      controller.userData.selected = rootObject;

      // Remove from falling objects if grabbed
      const fallingIndex = fallingObjects.indexOf(rootObject);
      if (fallingIndex !== -1) {
        fallingObjects.splice(fallingIndex, 1);
      }

      console.log('Select Start: Object attached to controller');
    } else {
      console.log('Select Start: Object is in exclusion list (maa_2)');
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

    group.attach(object);
    controller.userData.selected = undefined;

    // Add to falling objects
    if (!fallingObjects.includes(object)) {
      fallingObjects.push(object);
    }
  }
}

function updateGravity() {
  const groundLevel = 0;
  const gravitySpeed = 0.05;

  for (let i = fallingObjects.length - 1; i >= 0; i--) {
    const obj = fallingObjects[i];

    if (obj.position.y > groundLevel) {
      obj.position.y -= gravitySpeed;
      // Snap if went below ground
      if (obj.position.y < groundLevel) {
        obj.position.y = groundLevel;
        fallingObjects.splice(i, 1);
      }
    } else {
      // Already on ground or below
      obj.position.y = groundLevel;
      fallingObjects.splice(i, 1);
    }
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
