// scene.js — renderer, camera, ánh sáng, controls và hàm fit camera vào khung.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---- Tham số khung & góc nhìn ----
export const VIEW_W = 720, VIEW_H = 1280;   // khung cứng, không đổi theo cửa sổ
export const ELEV_DEG = 20;                 // góc nhìn thấp, gần chính diện như ảnh 1
const FRAME_MARGIN = 1.05;                  // chừa lề ngang
const LIFT_Y = 0.6;                         // nhìn cao hơn đỉnh content -> cụm tụt xuống đáy như ảnh 1

export const app = document.getElementById('app');

// ---- Renderer ----
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1000);

// ---- Lights (mềm, sáng, giống look trong ảnh) ----
const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x8a93a0, 0.95);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.45);
key.position.set(-3, 6, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfeaff, 0.5);
fill.position.set(4, 1, 3);
scene.add(fill);

// ---- Controls ----
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;        // camera cố định, không xoay (theo yêu cầu)
controls.target.set(0, 0, 0);

// ---- Fit camera: vừa khung theo chiều ngang, đẩy cụm xuống đáy (như ảnh 1) ----
export function frameToBox(box) {
  renderer.setSize(VIEW_W, VIEW_H);
  const aspect = VIEW_W / VIEW_H;
  camera.aspect = aspect;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const halfW = (box.max.x - box.min.x) / 2;
  const dist = (halfW / Math.tan(hFov / 2)) * FRAME_MARGIN;  // fit theo bề ngang
  const ty = box.max.y + LIFT_Y;        // điểm nhìn cao hơn đỉnh -> content tụt xuống dưới
  const elev = THREE.MathUtils.degToRad(ELEV_DEG);
  camera.position.set(cx, ty + dist * Math.sin(elev), cz + dist * Math.cos(elev));
  camera.lookAt(cx, ty, cz);
  controls.target.set(cx, ty, cz);
  camera.updateProjectionMatrix();
}
