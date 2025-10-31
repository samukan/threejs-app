import './style.css';

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';

// Globals
let camera, scene, renderer, controls;

init();

const ASSET_BASE = import.meta.env.BASE_URL || '/';
new RGBELoader().setPath(`${ASSET_BASE}equirectangular/textures/`).load(
  'lakeside_sunrise_1k.hdr',
  function (hdrTexture) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

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

        scene.add(ground);
        console.log('Ground (maa.glb) loaded');
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

        model.position.set(-center.x, -box.min.y, -center.z);

        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 5) {
          const scale = 5 / maxDim;
          model.scale.setScalar(scale);
        }

        scene.add(model);

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
  const app = document.getElementById('app') || document.body;
  app.appendChild(renderer.domElement);

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
