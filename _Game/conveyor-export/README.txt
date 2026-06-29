CONVEYOR EXPORT — Hướng dẫn dùng
=================================================================

MỤC LỤC
  1. Conveyor gồm những gì
  2. Cấu trúc folder
  3. Chạy demo (local server)
  4. Nhúng vào project Three.js khác (3 bước)
  5. API: addConveyor(...) — tham số & ý nghĩa
  6. Góc camera (QUAN TRỌNG — coupling)
  7. Mũi tên (arrow) chạy loop — cơ chế & cách chỉnh
  8. Material & màu sắc
  9. Dependencies
 10. Troubleshooting

-----------------------------------------------------------------
1. CONVEYOR GỒM NHỮNG GÌ
-----------------------------------------------------------------
Conveyor = 2 phần ghép lại:

  (A) KHUNG VIỀN  — từ assets/conveyor.fbx
      Hình stadium/pill (bo 2 đầu). Được gán material TRẮNG (outline).
      Đây là phần "vật lý" duy nhất lấy từ FBX.

  (B) MẶT BĂNG (belt) — KHÔNG từ FBX, sinh bằng code
      Là 1 PlaneGeometry phủ lên mặt trước khung, dùng CanvasTexture
      vẽ lại mỗi frame:
        - nền xanh-grey (#647689)
        - 2 viền outline trắng
        - các MŨI TÊN trắng nhạt chạy vòng quanh oval (loop vô tận)
      Hàm beltUpdate() (trả về từ addConveyor) phải gọi mỗi frame để
      animate mũi tên.

-----------------------------------------------------------------
2. CẤU TRÚC FOLDER
-----------------------------------------------------------------
  conveyor-export/
  ├── README.txt          # file này
  ├── index.html          # demo standalone
  ├── css/style.css       # nền + khung 720x1280 (chỉ cho demo)
  ├── js/
  │   ├── conveyor.js     # ⭐ CORE — addConveyor() + belt + arrow (NGUYÊN TRẠNG)
  │   ├── scene.js        # renderer/camera/lights/ELEV_DEG/frameToBox (NGUYÊN TRẠNG)
  │   ├── fbx.js          # wrapper FBXLoader (NGUYÊN TRẠNG)
  │   └── main.js         # entry DEMO (chỉ conveyor, truyền GEO hardcode)
  └── assets/
      └── conveyor.fbx    # khung viền (1.5 MB)

  File BẮT BUỘC mang theo khi nhúng: conveyor.js + conveyor.fbx + fbx.js.
  scene.js: mang theo NẾU project chưa có camera riêng (xem mục 6).
  index.html / css / main.js: chỉ phục vụ demo, có thể bỏ.

-----------------------------------------------------------------
3. CHẠY DEMO (LOCAL SERVER)
-----------------------------------------------------------------
Bắt buộc qua local server (ES module + fetch FBX bị CORS chặn nếu mở
bằng file://):

  cd conveyor-export
  python -m http.server 8000

Rồi mở:  http://localhost:8000
Sẽ thấy conveyor lơ lửng, mũi tên chạy vòng quanh. Test ở viewport
720x1280 (DevTools device mode) cho đúng khung.

-----------------------------------------------------------------
4. NHÚNG VÀO PROJECT THREE.JS KHÁC (3 BƯỚC)
-----------------------------------------------------------------
  B1. Copy js/conveyor.js, js/fbx.js, assets/conveyor.fbx vào project.

  B2. Bảo đảm conveyor.js import được ELEV_DEG. 2 cách:
      (a) Mang theo scene.js và import từ đó (như hiện tại), HOẶC
      (b) Sửa dòng đầu conveyor.js:
              import { ELEV_DEG } from './scene.js';
          thành 1 hằng số trùng với góc camera project bạn:
              const ELEV_DEG = 20;   // = elevation camera của bạn
      (Xem mục 6 để hiểu vì sao.)

  B3. Trong vòng init() của bạn:

          import { loadFbx } from './fbx.js';
          import { addConveyor } from './conveyor.js';

          const convSrc = await loadFbx('assets/conveyor.fbx');
          const beltUpdate = addConveyor(scene, convSrc, renderer, {
            gridHalfX: 1.77,   // chỉnh theo bề ngang bạn muốn (xem mục 5)
            gridHalfZ: 1.34,
            bucketH: 2,
          });

          // trong render loop:
          beltUpdate();   // <-- BẮT BUỘC gọi mỗi frame, nếu không mũi tên đứng im

-----------------------------------------------------------------
5. API: addConveyor(scene, source, renderer, opts) -> beltUpdate
-----------------------------------------------------------------
  scene    : THREE.Scene  — conveyor sẽ được add vào đây.
  source   : Group        — model trả về từ loadFbx('assets/conveyor.fbx').
  renderer : WebGLRenderer— dùng để lấy maxAnisotropy cho texture belt.
  opts     : { gridHalfX, gridHalfZ, bucketH }

      gridHalfX : nửa BỀ NGANG vùng đặt conveyor.
                  -> conveyor được scale để rộng = 2 * gridHalfX (đơn vị world).
                  Đây là số bạn chỉnh nhiều nhất để conveyor to/nhỏ.
      gridHalfZ : nửa CHIỀU SÂU. conveyor bị đẩy LÙI ra sau 1 đoạn = gridHalfZ
                  (position.z -= gridHalfZ).
      bucketH   : chiều cao tham chiếu. Quyết định:
                    - khe hở Y phía dưới (gap = bucketH * 0.55)
                    - conveyor nâng lên y += bucketH/2 + gap
                  Nếu đặt standalone, cứ để 2 và chỉnh position.y sau nếu cần.

  GIÁ TRỊ DEMO (xấp xỉ lưới 4×3 bucket gốc):
      gridHalfX = 1.77, gridHalfZ = 1.34, bucketH = 2

  RETURN: beltUpdate() — gọi mỗi frame để animate mũi tên.

  Lưu ý: 3 tham số này là "di sản" từ project gốc (conveyor căn theo lưới
  bucket). Code giữ NGUYÊN TRẠNG nên không đổi tên. Cứ coi:
      gridHalfX = "conveyor rộng bao nhiêu / 2"
      gridHalfZ = "đẩy lùi ra sau bao nhiêu"
      bucketH   = "nâng cao / khe hở dưới"

-----------------------------------------------------------------
6. GÓC CAMERA (QUAN TRỌNG — COUPLING)
-----------------------------------------------------------------
Conveyor được NGHIÊNG để mặt belt vuông góc trục nhìn (nhìn "flat" vào
camera). Dòng trong conveyor.js:

      conv.rotation.x = degToRad(180 - ELEV_DEG);

=> ELEV_DEG PHẢI khớp elevation (góc ngẩng) của camera, nếu không mặt
belt sẽ bị méo phối cảnh.

Setup camera gốc (scene.js):
  - PerspectiveCamera, fov = 46
  - ELEV_DEG = 20  (góc nhìn THẤP, gần chính diện)
  - Camera đặt: cao hơn target 1 chút, lùi ra theo elevation:
        camera.position = (cx, ty + dist*sin(elev), cz + dist*cos(elev))
        camera.lookAt(cx, ty, cz)
  - dist tính để fit theo BỀ NGANG khung (frameToBox).
  - controls.enabled = false  (camera CỐ ĐỊNH, không xoay).

Nếu project bạn dùng camera khác:
  -> đặt ELEV_DEG trong conveyor.js = đúng góc elevation camera của bạn.
  -> hoặc nếu camera nhìn ngang (elevation ~0): để conveyor "đứng",
     bạn có thể bỏ/чỉnh dòng rotation.x cho hợp scene.

-----------------------------------------------------------------
7. MŨI TÊN (ARROW) CHẠY LOOP — CƠ CHẾ & CÁCH CHỈNH
-----------------------------------------------------------------
Mũi tên KHÔNG phải sprite/texture rời — chúng được VẼ bằng Canvas 2D
dọc đường centerline của hình stadium (oval), rồi loop theo arc-length.
Toàn bộ nằm trong conveyor.js, hàm drawBelt() + biến phase.

Các tham số chỉnh nhanh (trong conveyor.js):

  TỐC ĐỘ + HƯỚNG CHẠY:  (dòng beltUpdate)
      phase -= perMid * 0.0016;
      - số 0.0016 lớn hơn  => chạy nhanh hơn.
      - đổi dấu (-> +=)     => chạy ngược lại.

  KHOẢNG CÁCH GIỮA MŨI TÊN:
      const arrowGap = PH * 0.42;   // lớn hơn => thưa hơn
      (nArrows tự tính từ chu vi / arrowGap, tối thiểu 8)

  KÍCH THƯỚC MŨI TÊN:
      const aSize = roadW * 0.42;   // nửa độ cao mũi tên

  ĐỘ MỜ / MÀU MŨI TÊN:
      bx.strokeStyle = 'rgba(255,255,255,0.28)';
      bx.lineWidth   = roadW * 0.16;

  BỀ RỘNG MẶT ĐƯỜNG (vùng chứa mũi tên):
      const roadW = PH * 0.30;

  BỀ DÀY VIỀN OUTLINE TRẮNG:
      const bw = PH * 0.085;

Hình học oval: hàm stadiumPoint(d, s) trả {x, y, ang} tại arc-length s,
inset d. Mũi tên xoay theo ang (hướng tiếp tuyến) để luôn "chỉ về phía
trước" dọc đường chạy.

-----------------------------------------------------------------
8. MATERIAL & MÀU SẮC
-----------------------------------------------------------------
  KHUNG (FBX)  — conveyor.js, matFrame:
      MeshStandardMaterial { color: 0xffffff, emissive: 0x3a4452,
                             roughness: 0.35, metalness: 0.0 }
      => viền trắng, hơi phát sáng xám-xanh nhẹ.

  MẶT BELT     — beltMat:
      MeshBasicMaterial { map: CanvasTexture, transparent: true,
                          side: DoubleSide }
      => KHÔNG nhận sáng (Basic) để màu nền/mũi tên luôn đúng, không bị
         ánh sáng scene làm tối.
      Màu nền belt: '#647689' (xanh-grey). Viền: '#ffffff'.

  Đổi màu nền belt: sửa  bx.fillStyle = '#647689';  trong drawBelt().

  Ánh sáng scene (scene.js): Hemisphere + 2 Directional (key + fill),
  toneMapping ACESFilmic, exposure 1.12. Chỉ ảnh hưởng KHUNG (Standard),
  không ảnh hưởng belt (Basic).

-----------------------------------------------------------------
9. DEPENDENCIES
-----------------------------------------------------------------
  - three @ 0.160.0  (qua importmap unpkg trong index.html)
      "three"          -> build/three.module.js
      "three/addons/"  -> examples/jsm/
  - addons dùng tới:
      examples/jsm/loaders/FBXLoader.js   (fbx.js)
      examples/jsm/controls/OrbitControls.js (scene.js — chỉ để fix camera)
  - Không build step, không framework. Thuần ES module.

  Đổi version three: sửa importmap. FBXLoader thường tương thích các bản
  r0.15x–r0.16x; nếu nâng cao hơn nhiều nên test lại loader.

-----------------------------------------------------------------
10. TROUBLESHOOTING
-----------------------------------------------------------------
  - Mở file:// -> trắng/lỗi: PHẢI chạy qua local server (mục 3).
  - Conveyor không hiện / "Lỗi tải FBX": sai đường dẫn assets/conveyor.fbx
    (loadFbx nhận path TƯƠNG ĐỐI so với trang HTML).
  - Mũi tên đứng im: quên gọi beltUpdate() trong render loop.
  - Belt bị méo / nghiêng lạ: ELEV_DEG không khớp góc camera (mục 6).
  - Conveyor quá to/nhỏ: chỉnh gridHalfX (mục 5).
  - Conveyor lệch lên/xuống: chỉnh bucketH hoặc set thẳng conv.position.y
    sau khi addConveyor (conveyor được add vào scene, bạn có thể tìm lại
    object cuối cùng vừa add để tinh chỉnh).
