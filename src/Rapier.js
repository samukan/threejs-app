import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RapierPhysics} from 'three/addons/physics/RapierPhysics.js';
import {RapierHelper} from 'three/addons/helpers/RapierHelper.js';
import {VRButton} from 'three/addons/webxr/VRButton.js';
import {XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import Stats from 'three/addons/libs/stats.module.js';

let camera, scene, renderer, controls, stats;
let physics, physicsHelper;

// Controllers
let controller1, controller2;
let controllerGrip1, controllerGrip2;

const raycaster = new THREE.Raycaster();
const tempVec = new THREE.Vector3();

// UUSI: apuvektori + heiton voimakkuus
const tempPos = new THREE.Vector3();
const THROW_MULTIPLIER = 3; // nosta/laskemalla säädät heiton pituutta

// This group stores ALL pickable / physics-enabled meshes
const group = new THREE.Group();

// initialize marker for teleport and referencespace of headset
// initialize the INTERSECTION array for teleport
let marker, baseReferenceSpace;
let INTERSECTION;
const tempMatrix = new THREE.Matrix4();
// create a new empty group to include imported models you want
// to teleport with
let teleportgroup = new THREE.Group();
teleportgroup.name = 'Teleport-Group';

init();

async function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202028);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.6, 3);

  const hemi = new THREE.HemisphereLight(0x555555, 0x111122, 1.0);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true;
  scene.add(dirLight);

  renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.xr.enabled = true;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.update();

  stats = new Stats();
  document.body.appendChild(stats.dom);

  // Add group to scene
  scene.add(group);
  // add the empty group to the scene
  scene.add(teleportgroup);

  marker = new THREE.Mesh(
    new THREE.CircleGeometry(0.25, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({color: 0x808080})
  );
  scene.add(marker);

  // Floor
  // 1. TODOO tuo tähän oma lanscape/maa
  const floorGeo = new THREE.BoxGeometry(10, 0.2, 10);
  const floorMat = new THREE.MeshStandardMaterial({color: 0x808080});
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);
  teleportgroup.add(floor);

  // Init physics
  await initPhysics(floor);

  // Init VR
  initVR();

  window.addEventListener('resize', onWindowResize);

  renderer.setAnimationLoop(animate);
}

async function initPhysics(floor) {
  physics = await RapierPhysics();
  physics.addScene(scene);

  physics.addMesh(floor, 0); // static

  const SPAWN_RANGE = 8; // width of the square in world units

  // Add some falling boxes
  for (let i = 0; i < 5; i++) {
    addBox(
      new THREE.Vector3(
        (Math.random() - 0.5) * SPAWN_RANGE,
        1.5 + i * 0.5,
        (Math.random() - 0.5) * SPAWN_RANGE
      )
    );
  }

  physicsHelper = new RapierHelper(physics.world);
  scene.add(physicsHelper);
}

function addBox(position) {
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const mat = new THREE.MeshStandardMaterial({
    color: Math.floor(Math.random() * 0xffffff),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.position.copy(position);

  // add to group so you can pick the object
  // adding to the group will add the object to the scene too,  (group is child of scene)
  group.add(mesh);

  physics.addMesh(mesh, 1, 0.2);
}

// -----------------------------
//    VR SETUP
// -----------------------------

function initVR() {
  document.body.appendChild(VRButton.createButton(renderer));

  renderer.xr.addEventListener(
    'sessionstart',
    () => (baseReferenceSpace = renderer.xr.getReferenceSpace())
  );

  const controllerModelFactory = new XRControllerModelFactory();

  // Controller 1
  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onSelectStart);
  controller1.addEventListener('selectend', onSelectEnd);
  scene.add(controller1);

  controller1.addEventListener('squeezestart', onSqueezeStart);
  controller1.addEventListener('squeezeend', onSqueezeEnd);

  // Controller 2
  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onSelectStart);
  controller2.addEventListener('selectend', onSelectEnd);
  scene.add(controller2);

  controller2.addEventListener('squeezestart', onSqueezeStart);
  controller2.addEventListener('squeezeend', onSqueezeEnd);

  // Grips (visual models)
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

  // Laser lines
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);

  const line = new THREE.Line(lineGeo);
  line.name = 'line';
  line.scale.z = 1.5;

  controller1.add(line.clone());
  controller2.add(line.clone());
}

// -----------------------------
//  XR TELEPORT
// -----------------------------

function onSqueezeStart() {
  this.userData.isSqueezing = true;
  console.log('Controller squeeze started');
}
function onSqueezeEnd() {
  this.userData.isSqueezing = false;
  console.log('squeezeend');
  if (INTERSECTION) {
    const offsetPosition = {
      x: -INTERSECTION.x,
      y: -INTERSECTION.y,
      z: -INTERSECTION.z,
      w: 1,
    };
    const offsetRotation = new THREE.Quaternion();
    const transform = new XRRigidTransform(offsetPosition, offsetRotation);
    const teleportSpaceOffset =
      baseReferenceSpace.getOffsetReferenceSpace(transform);
    renderer.xr.setReferenceSpace(teleportSpaceOffset);
  }
}

// -----------------------------
//  XR SELECTION SYSTEM
// -----------------------------

function getIntersections(controller) {
  raycaster.setFromXRController(controller);

  return raycaster.intersectObjects(group.children, true);
}

function onSelectStart(event) {
  const controller = event.target;

  const intersections = getIntersections(controller);
  if (intersections.length === 0) return;

  const intersection = intersections[0];
  const object = intersection.object;

  // Convert hit point (world) -> controller local space
  const localPoint = controller.worldToLocal(tempVec.copy(intersection.point));

  // Remove from physics
  physics.removeMesh(object);

  // Attach to controller (follow hand)
  object.material.emissive.setHex(0x333333);
  controller.add(object);

  // Use the local hit point as reference for moving the box to right location
  object.position.copy(localPoint);

  controller.userData.selected = object;
}

function onSelectEnd(event) {
  const controller = event.target;
  const object = controller.userData.selected;
  if (!object) return;

  // Detach back to scene group
  scene.attach(object);
  object.material.emissive.setHex(0x000000);

  // Re-add to group for picking
  group.add(object);
  // Re-add to physics with new global transform
  physics.addMesh(object, 1, 0.2);

  // 🔥 Käden liikkeen suunta → heiton nopeus
  const controllerVel = controller.userData.velocity;
  if (controllerVel) {
    const throwVel = controllerVel.clone().multiplyScalar(THROW_MULTIPLIER);

    // (valinnainen rajoitus, jos haluat max-nopeuden)
    // const maxSpeed = 10;
    // if (throwVel.length() > maxSpeed) {
    //   throwVel.setLength(maxSpeed);
    // }

    physics.setMeshVelocity(object, throwVel);
  }

  controller.userData.selected = undefined;
}

function highlightController(controller) {
  const line = controller.getObjectByName('line');
  if (!line || controller.userData.selected) return;

  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    line.scale.z = intersections[0].distance;
  } else {
    line.scale.z = 1.5;
  }
}

// -----------------------------
//  CONTROLLER VELOCITY
// -----------------------------

function updateControllerVelocity(controller, deltaSeconds) {
  if (!controller) return;

  if (!controller.userData.prevPos) {
    controller.userData.prevPos = new THREE.Vector3();
    controller.userData.velocity = new THREE.Vector3();
    controller.userData.prevPos.setFromMatrixPosition(controller.matrixWorld);
    return;
  }

  const prevPos = controller.userData.prevPos;
  const vel = controller.userData.velocity;

  tempPos.setFromMatrixPosition(controller.matrixWorld);

  if (deltaSeconds > 0) {
    // v = (x_now - x_prev) / dt
    vel.copy(tempPos).sub(prevPos).divideScalar(deltaSeconds);
  } else {
    vel.set(0, 0, 0);
  }

  prevPos.copy(tempPos);
}

// -----------------------------
//     MOVE MARKER
// -----------------------------

function moveMarker() {
  INTERSECTION = undefined;
  if (controller1.userData.isSqueezing === true) {
    tempMatrix.identity().extractRotation(controller1.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    //const intersects = raycaster.intersectObjects([floor]);
    const intersects = raycaster.intersectObjects(teleportgroup.children, true);
    if (intersects.length > 0) {
      INTERSECTION = intersects[0].point;
      console.log(intersects[0]);
      console.log(INTERSECTION);
    }
  } else if (controller2.userData.isSqueezing === true) {
    tempMatrix.identity().extractRotation(controller2.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller2.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    // const intersects = raycaster.intersectObjects([floor]);
    const intersects = raycaster.intersectObjects(teleportgroup.children, true);
    if (intersects.length > 0) {
      INTERSECTION = intersects[0].point;
    }
  }
  if (INTERSECTION) marker.position.copy(INTERSECTION);
  marker.visible = INTERSECTION !== undefined;
}

// -----------------------------
//     ANIMATE
// -----------------------------

let lastTime = performance.now() / 1000;

function animate() {
  const now = performance.now() / 1000;
  const delta = now - lastTime;
  lastTime = now;

  // Päivitä ohjainten nopeus
  updateControllerVelocity(controller1, delta);
  updateControllerVelocity(controller2, delta);
  // Remove fallen objects
  for (let i = group.children.length - 1; i >= 0; i--) {
    const mesh = group.children[i];
    if (mesh.position.y < -5) {
      physics.removeMesh(mesh);
      group.remove(mesh);
      scene.remove(mesh);
    }
  }

  if (physicsHelper) physicsHelper.update(); // 👈 guard

  highlightController(controller1);
  highlightController(controller2);

  moveMarker();

  controls.update();
  renderer.render(scene, camera);
  stats.update();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
