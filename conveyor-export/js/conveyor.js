// conveyor.js — dựng conveyor phía trên buckets + băng chuyền oval có mũi tên chạy.
import * as THREE from 'three';
import { ELEV_DEG } from './scene.js';

// Dựng conveyor vào scene. Trả về beltUpdate() để gọi mỗi frame (mũi tên chạy theo loop).
export function addConveyor(scene, source, renderer, { gridHalfX, gridHalfZ, bucketH }) {
  const conv = source;

  // Asset = ống bo hình stadium (khung viền). Theo ảnh 1 -> khung làm OUTLINE trắng.
  const matFrame = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0x3a4452, roughness: 0.35, metalness: 0.0,
  });
  conv.traverse((o) => { if (o.isMesh) { o.material = matFrame; o.castShadow = false; } });

  // chuẩn hoá: scale theo bề ngang lưới, recenter về gốc rồi đẩy lên trên buckets
  const cbox0 = new THREE.Box3().setFromObject(conv);
  const csize = cbox0.getSize(new THREE.Vector3());
  const cctr  = cbox0.getCenter(new THREE.Vector3());
  const targetW = 2 * gridHalfX;              // bề ngang ~ bằng hàng 4 bucket
  const cscale = targetW / csize.x;

  // ---- Belt: mặt băng chuyền là 1 vòng oval (stadium), mũi tên chạy THEO LOOP ----
  // Vẽ lại canvas mỗi frame: nền xanh-grey + 2 viền outline trắng, mũi tên trắng nhạt
  // di chuyển dọc đường centerline (giữa 2 viền) đi vòng quanh oval.
  const PH = 256;                                       // chiều cao canvas (px)
  const PW = Math.round(PH * (csize.x * 0.94) / (csize.y * 0.80));
  const bcv = document.createElement('canvas');
  bcv.width = PW; bcv.height = PH;
  const bx = bcv.getContext('2d');

  const Ls = PW - PH;                                   // độ dài đoạn thẳng (chung mọi inset)
  const bw = PH * 0.085;                                // bề dày viền outline trắng
  const roadW = PH * 0.30;                              // bề rộng mặt đường (vùng có mũi tên)
  // điểm trên stadium tại inset d, theo arc-length s -> {x,y, ang (hướng chạy)}
  function stadiumPoint(d, s) {
    const r = (PH - 2 * d) / 2, cx = PW / 2, cy = PH / 2;
    const per = 2 * Ls + 2 * Math.PI * r;
    s = ((s % per) + per) % per;
    if (s < Ls) {                                      // cạnh trên: trái -> phải
      return { x: cx - Ls / 2 + s, y: cy - r, ang: 0 };
    }
    s -= Ls;
    if (s < Math.PI * r) {                             // cap phải: trên -> dưới
      const a = -Math.PI / 2 + s / r;
      return { x: cx + Ls / 2 + r * Math.cos(a), y: cy + r * Math.sin(a), ang: a + Math.PI / 2 };
    }
    s -= Math.PI * r;
    if (s < Ls) {                                      // cạnh dưới: phải -> trái
      return { x: cx + Ls / 2 - s, y: cy + r, ang: Math.PI };
    }
    s -= Ls;
    const a = Math.PI / 2 + s / r;                     // cap trái: dưới -> trên
    return { x: cx - Ls / 2 + r * Math.cos(a), y: cy + r * Math.sin(a), ang: a + Math.PI / 2 };
  }
  function stadiumPath(d) {                            // path stadium (để fill/stroke)
    const r = (PH - 2 * d) / 2, cx = PW / 2, cy = PH / 2;
    bx.beginPath();
    bx.moveTo(cx - Ls / 2, cy - r);
    bx.lineTo(cx + Ls / 2, cy - r);
    bx.arc(cx + Ls / 2, cy, r, -Math.PI / 2, Math.PI / 2);
    bx.lineTo(cx - Ls / 2, cy + r);
    bx.arc(cx - Ls / 2, cy, r, Math.PI / 2, Math.PI * 1.5);
    bx.closePath();
  }
  const dMid = bw + roadW / 2;                         // inset của centerline mặt đường
  const perMid = 2 * Ls + 2 * Math.PI * ((PH - 2 * dMid) / 2);
  const arrowGap = PH * 0.42;                          // khoảng cách giữa các mũi tên
  const nArrows = Math.max(8, Math.round(perMid / arrowGap));
  const aSize = roadW * 0.42;                          // nửa độ cao mũi tên
  let phase = 0;

  function drawBelt() {
    bx.clearRect(0, 0, PW, PH);
    stadiumPath(bw * 0.5); bx.save(); bx.clip();        // bo góc ngoài -> trong suốt ngoài pill
    // nền xanh-grey toàn mặt
    bx.fillStyle = '#647689'; bx.fillRect(0, 0, PW, PH);
    // mũi tên trắng nhạt chạy dọc centerline (theo loop)
    bx.strokeStyle = 'rgba(255,255,255,0.28)';
    bx.lineWidth = roadW * 0.16; bx.lineCap = 'round'; bx.lineJoin = 'round';
    for (let i = 0; i < nArrows; i++) {
      const p = stadiumPoint(dMid, phase + i * (perMid / nArrows));
      bx.save();
      bx.translate(p.x, p.y); bx.rotate(p.ang + Math.PI);
      bx.beginPath();
      bx.moveTo(-aSize * 0.45, -aSize); bx.lineTo(aSize * 0.45, 0); bx.lineTo(-aSize * 0.45, aSize);
      bx.stroke();
      bx.restore();
    }
    bx.restore();
    // 2 viền outline trắng (mặt đường nằm giữa)
    bx.strokeStyle = '#ffffff'; bx.lineWidth = bw; bx.lineJoin = 'round';
    stadiumPath(bw * 0.5); bx.stroke();                 // viền ngoài
    stadiumPath(bw + roadW); bx.stroke();               // viền trong
    beltTexObj.needsUpdate = true;
  }

  const beltTexObj = new THREE.CanvasTexture(bcv);
  beltTexObj.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const beltMat = new THREE.MeshBasicMaterial({ map: beltTexObj, transparent: true, side: THREE.DoubleSide });
  const beltGeo = new THREE.PlaneGeometry(csize.x * 0.94, csize.y * 0.80);
  const belt = new THREE.Mesh(beltGeo, beltMat);
  belt.position.set(cctr.x, cctr.y, cctr.z - csize.z * 0.7);  // phủ lên mặt trước (về phía camera)
  conv.add(belt);
  drawBelt();
  const beltUpdate = () => { phase -= perMid * 0.0016; drawBelt(); };  // chạy vòng loop (ngược)

  conv.scale.setScalar(cscale);
  conv.position.copy(cctr.multiplyScalar(-cscale));   // tâm về (0,0,0)
  // lật mặt trên về phía camera + nghiêng bù elevation -> vuông góc trục nhìn (flat)
  conv.rotation.x = THREE.MathUtils.degToRad(180 - ELEV_DEG);

  const bucketTop = bucketH / 2;
  const gap = bucketH * 0.55;                 // khe hở "trên buckets 1 chút" (conveyor đã nằm phẳng)
  conv.position.y += bucketTop + gap;
  conv.position.z += -gridHalfZ;              // lùi ra sau hàng bucket sau cùng
  scene.add(conv);

  return beltUpdate;
}
