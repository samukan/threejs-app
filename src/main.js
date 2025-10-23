import './style.css';

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// Globals
let camera, scene, renderer, controls, snowman;

init();

function init() {
  // Scene
  scene = new THREE.Scene();

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const app = document.getElementById('app') || document.body;
  app.appendChild(renderer.domElement);

  snowman = new THREE.Group();

  // Materials that respond to lights
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0.0,
  });
  const hatMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.5,
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0xff7f00,
    roughness: 0.9,
  });

  // Body (Sphere)
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), snowMat);
  body.position.set(0, 0, 0);
  snowman.add(body);

  // Head (Sphere)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16), snowMat);
  head.position.set(0, 1.3, 0);
  snowman.add(head);

  // Nose (Cone)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 16), noseMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.3, 0.6);
  snowman.add(nose);

  // Hat
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.05, 24),
    hatMat
  );
  brim.position.set(0, 1.9, 0);
  snowman.add(brim);

  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.5, 24),
    hatMat
  );
  crown.position.set(0, 2.15, 0);
  snowman.add(crown);

  scene.add(snowman);

  // Helpers
  const axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  // Lights
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);

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

  // Start render loop
  renderer.setAnimationLoop(animate);

  // Events
  window.addEventListener('resize', onWindowResize, false);
}

function animate() {
  // idle rotation
  if (snowman) {
    snowman.rotation.y += 0.003;
  }

  // update controls
  controls.update();

  // render
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
