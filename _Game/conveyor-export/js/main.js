// main.js — DEMO entry cho conveyor standalone (KHÔNG cần buckets).
// Nạp conveyor.fbx, dựng vào scene, fit camera, chạy loop mũi tên.
import * as THREE from 'three';
import { renderer, scene, camera, controls, frameToBox } from './scene.js';
import { loadFbx } from './fbx.js';
import { addConveyor } from './conveyor.js';

// ----- Tham số "lưới bucket" giả lập -----------------------------------------
// conveyor.js (giữ nguyên trạng) cần 3 số này để tự scale bề ngang + đặt vị trí.
// Trong project gốc chúng được tính từ lưới 4×3 bucket. Ở demo standalone ta
// truyền sẵn giá trị xấp xỉ lưới gốc. Chỉnh GEO khi nhúng vào project khác:
//   gridHalfX : nửa BỀ NGANG vùng đặt conveyor  -> conveyor rộng = 2*gridHalfX
//   gridHalfZ : nửa CHIỀU SÂU  -> conveyor lùi ra sau 1 đoạn = gridHalfZ
//   bucketH   : chiều cao 1 "ô" -> quyết định khe hở Y bên dưới conveyor
const GEO = { gridHalfX: 1.77, gridHalfZ: 1.34, bucketH: 2 };

async function init() {
  try {
    const convSrc = await loadFbx('assets/conveyor.fbx');
    const beltUpdate = addConveyor(scene, convSrc, renderer, GEO);

    document.getElementById('loading').remove();

    const fit = () => frameToBox(new THREE.Box3().setFromObject(scene));
    fit();
    addEventListener('resize', fit);

    renderer.setAnimationLoop(() => {
      controls.update();
      beltUpdate();                 // mũi tên chạy vòng loop quanh conveyor
      renderer.render(scene, camera);
    });
  } catch (e) {
    document.getElementById('loading').textContent = 'Lỗi tải FBX: ' + e.message;
    console.error(e);
  }
}

init();
