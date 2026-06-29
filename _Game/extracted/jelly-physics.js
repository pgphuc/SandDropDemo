/* ============================================================
   jelly-physics.js
   Mô phỏng vật lý khối jelly khi RƠI từ bức tranh xuống đáy (phễu/feed floor).
   Tách từ Jelly_Drop_3D.html để copy sang project khác.

   Đặc điểm:
     - KHÔNG phụ thuộc THREE.js. Toàn bộ là toán 2D thuần (mặt phẳng x,y).
       Mỗi "faller" là object {x,y,vx,vy,ang,vang,r,color,life}.
       Việc gắn vào mesh 3D do code bên ngoài tự làm (xem ví dụ cuối file).
     - Mô phỏng gồm:
         * trọng lực + giới hạn tốc độ (stepFaller)
         * va chạm với các ô tranh còn lại = "địa hình" để jelly lăn xuống
         * tường khung + phễu thu hẹp (funnelHalfAt)
         * sàn feed (cubes dồn lại ngay trên băng chuyền)
         * va chạm mềm giữa các khối để chúng xếp chồng thành đống (collideFallers)

   Phụ thuộc do người dùng cung cấp khi khởi tạo:
     - grid:      mảng 2D grid[r][c] = color id (>=0) hoặc -1 nếu ô trống.
                  (Vật lý đọc grid để biết ô tranh nào còn chặn đường.)
     - cellWorld(r,c) -> {x,y,z}: tâm thế giới của ô (r,c). Có sẵn default.

   Cách dùng:
     - Trình duyệt:  <script src="jelly-physics.js"></script> -> window.JellyPhysics
     - ES module:    import { JellyPhysics } from './jelly-physics.js'
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JellyPhysics = factory().JellyPhysics, root.JellyPhysicsModule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- helpers toán học -------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp  = (a, b, t) => a + (b - a) * t;

  // ---- cấu hình mặc định (lấy nguyên từ CFG trong game gốc) -------------
  const DEFAULT_CONFIG = {
    N: 20,                      // độ phân giải lưới (N x N)
    cell: 0.245,                // kích thước thế giới của 1 ô
    boardCenter: { x: 0, y: 4.8 }, // tâm bức tranh
    boardZ: 0.06,
    funnelY: 0.4,               // y của họng phễu (nơi các khối hội tụ)
    feedFloorY: 0.32,           // sàn: cubes dồn ngay trên lối vào băng chuyền
    funnel: { chuteHalf: 0.42 }, // nửa bề rộng họng phễu ở điểm hẹp nhất
    // tham số vật lý rơi (cubes lăn xuống tranh/khung như địa hình)
    phys: {
      g: -9.0,        // gia tốc trọng trường
      rest: 0.16,     // hệ số đàn hồi khi va ô tranh / khối khác
      wallRest: 0.28, // đàn hồi khi đập tường khung/phễu
      fric: 0.985,    // ma sát tiếp tuyến khi lăn
      maxV: 6.0,      // tốc độ tối đa
      life: 9.0,      // sau bao lâu (giây) nếu kẹt thì thả về miệng phễu
    },
  };

  // gộp nông cấu hình người dùng vào mặc định
  function mergeConfig(user) {
    const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    if (!user) return c;
    for (const k in user) {
      if (user[k] && typeof user[k] === 'object' && !Array.isArray(user[k]))
        c[k] = Object.assign(c[k] || {}, user[k]);
      else c[k] = user[k];
    }
    return c;
  }

  class JellyPhysics {
    /**
     * @param {object} opts
     * @param {Array<Array<number>>} opts.grid  grid[r][c] = color id hoặc -1
     * @param {function} [opts.cellWorld]       (r,c) -> {x,y,z}; mặc định tính từ config
     * @param {object}   [opts.config]          ghi đè DEFAULT_CONFIG
     * @param {function} [opts.rnd]             () -> [0,1); mặc định Math.random
     */
    constructor(opts = {}) {
      this.CFG = mergeConfig(opts.config);
      this.grid = opts.grid || [];
      this.rnd = opts.rnd || Math.random;
      this.cellWorld = opts.cellWorld || this._defaultCellWorld.bind(this);
      this.fallers = []; // {x,y,vx,vy,ang,vang,r,color,life, mesh?}
    }

    // bán kính va chạm của 1 khối jelly
    fallR() { return this.CFG.cell * 0.46; }

    // ---- hình học bảng/phễu (tự chứa) -----------------------------------
    boardHalfW() { return this.CFG.N * this.CFG.cell / 2; }
    picBottomY() { return this.CFG.boardCenter.y - this.boardHalfW(); }

    _defaultCellWorld(r, c) {
      const N = this.CFG.N, cell = this.CFG.cell;
      const x = this.CFG.boardCenter.x + (c - (N - 1) / 2) * cell;
      const y = this.CFG.boardCenter.y - (r - (N - 1) / 2) * cell;
      return { x, y, z: this.CFG.boardZ };
    }

    // nửa bề rộng tường (khung) tại độ cao y:
    //  - full bề rộng tranh khi còn trong tranh,
    //  - thu hẹp tuyến tính qua phễu xuống họng tại funnelY.
    funnelHalfAt(y) {
      const hw = this.boardHalfW(), bottom = this.picBottomY();
      const tip = this.CFG.funnelY, chute = this.CFG.funnel.chuteHalf;
      if (y >= bottom) return hw;
      if (y <= tip) return chute;
      return lerp(hw, chute, (bottom - y) / (bottom - tip));
    }

    // ---- tạo khối rơi từ 1 cụm ô cùng màu -------------------------------
    // cells: mảng [r,c]. Hàm sẽ xoá ô khỏi grid (đặt -1) và sinh faller.
    // onSpawn(faller, r, c, id) (tuỳ chọn) để code ngoài gắn mesh, ẩn instance...
    startFallCluster(cells, onSpawn) {
      if (!cells.length) return [];
      const ci = this.grid[cells[0][0]][cells[0][1]];
      const made = [];
      for (const [r, c] of cells) {
        const w = this.cellWorld(r, c);
        // xoá ô khỏi grid TRƯỚC để khối không bị chính ô của nó chặn
        this.grid[r][c] = -1;
        const f = {
          x: w.x, y: w.y,
          vx: (this.rnd() - 0.5) * 0.6, vy: -0.2,
          ang: 0, vang: (this.rnd() - 0.5) * 2,
          r: this.fallR(), color: ci, life: 0,
        };
        this.fallers.push(f);
        made.push(f);
        if (onSpawn) onSpawn(f, r, c, ci);
      }
      return made;
    }

    // ---- bước 1 khối: trọng lực + va chạm địa hình + tường + sàn --------
    stepFaller(f, dt) {
      const CFG = this.CFG, P = CFG.phys, SUB = 2, h = dt / SUB;
      const N = CFG.N, cell = CFG.cell, half = cell / 2, grid = this.grid;
      for (let s = 0; s < SUB; s++) {
        f.vy += P.g * h;
        // giới hạn tốc độ
        const sp = Math.hypot(f.vx, f.vy);
        if (sp > P.maxV) { const k = P.maxV / sp; f.vx *= k; f.vy *= k; }
        f.x += f.vx * h; f.y += f.vy * h; f.ang += f.vang * h;

        // --- va chạm với các ô tranh còn lại (địa hình) ---
        if (f.y > this.picBottomY() - cell &&
            f.y < CFG.boardCenter.y + this.boardHalfW() + cell) {
          const cf = (f.x - CFG.boardCenter.x) / cell + (N - 1) / 2;
          const rf = (N - 1) / 2 - (f.y - CFG.boardCenter.y) / cell;
          const c0 = Math.floor(cf), r0 = Math.floor(rf);
          for (let r = r0 - 1; r <= r0 + 1; r++)
            for (let c = c0 - 1; c <= c0 + 1; c++) {
              if (r < 0 || c < 0 || r >= N || c >= N) continue;
              if (grid[r][c] < 0) continue;
              const w = this.cellWorld(r, c);
              const nx0 = clamp(f.x, w.x - half, w.x + half);
              const ny0 = clamp(f.y, w.y - half, w.y + half);
              let dx = f.x - nx0, dy = f.y - ny0, d2 = dx * dx + dy * dy;
              if (d2 < f.r * f.r) {
                let d, nx, ny;
                if (d2 < 1e-7) { nx = 0; ny = 1; d = 0; } // tâm nằm trong ô -> đẩy lên
                else { d = Math.sqrt(d2); nx = dx / d; ny = dy / d; }
                const push = f.r - d;
                f.x += nx * push; f.y += ny * push;
                const vn = f.vx * nx + f.vy * ny;
                if (vn < 0) { f.vx -= (1 + P.rest) * vn * nx; f.vy -= (1 + P.rest) * vn * ny; }
                // tiếp tuyến -> tạo spin lăn + ma sát nhẹ
                const tx = -ny, ty = nx, vt = f.vx * tx + f.vy * ty;
                f.vang = -vt / Math.max(f.r, 1e-3);
                f.vx *= P.fric;
              }
            }
        }
        // --- tường khung / phễu hai bên ---
        const lim = this.funnelHalfAt(f.y) - f.r;
        if (f.x > lim)  { f.x = lim;  f.vx = -Math.abs(f.vx) * P.wallRest - 0.25; f.vang -= 3; }
        if (f.x < -lim) { f.x = -lim; f.vx =  Math.abs(f.vx) * P.wallRest + 0.25; f.vang += 3; }
        // --- sàn feed: cubes dồn lại ngay trên băng chuyền ---
        const floorY = CFG.feedFloorY + f.r;
        if (f.y < floorY) {
          f.y = floorY;
          if (f.vy < 0) f.vy = -f.vy * P.rest;
          f.vx *= 0.86;
          f.vang = -f.vx / Math.max(f.r, 1e-3);
        }
      }
    }

    // ---- va chạm mềm giữa các khối (xếp chồng thành đống jelly) ---------
    collideFallers() {
      const fallers = this.fallers, n = fallers.length, P = this.CFG.phys;
      for (let it = 0; it < 2; it++) {
        for (let a = 0; a < n; a++) {
          const A = fallers[a];
          for (let b = a + 1; b < n; b++) {
            const B = fallers[b];
            let dx = B.x - A.x, dy = B.y - A.y;
            const rr = A.r + B.r;
            let d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr) continue;
            if (d2 < 1e-7) { dx = (a & 1 ? 1 : -1) * 0.01; dy = 0.01; d2 = dx * dx + dy * dy; }
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (rr - d) * 0.5;
            A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
            const rvn = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
            if (rvn < 0) {
              const j = rvn * 0.5 * (1 + P.rest);
              A.vx += j * nx; A.vy += j * ny; B.vx -= j * nx; B.vy -= j * ny;
            }
          }
        }
      }
    }

    /**
     * Tiến toàn bộ mô phỏng 1 frame.
     * @param {number} dt        thời gian frame (giây)
     * @param {function} [onFaller]  callback(f) sau khi cập nhật, để đồng bộ mesh/scale/squash.
     * Trả về true nếu có khối bị "kẹt" và được reset về miệng phễu (để code ngoài xử lý nếu cần).
     */
    update(dt, onFaller) {
      const CFG = this.CFG;
      for (const f of this.fallers) { f.life += dt; this.stepFaller(f, dt); }
      this.collideFallers();
      for (let i = this.fallers.length - 1; i >= 0; i--) {
        const f = this.fallers[i];
        // kẹt quá lâu trên địa hình -> thả về đống ở miệng phễu để feed bình thường
        if (f.life > CFG.phys.life && f.y > CFG.feedFloorY + 0.6) {
          f.x = clamp(f.x, -CFG.funnel.chuteHalf + f.r, CFG.funnel.chuteHalf - f.r);
          f.y = CFG.feedFloorY + f.r; f.vx = 0; f.vy = 0; f.life = 0;
        }
        if (onFaller) onFaller(f, i);
      }
    }

    // helper tính z khi khối tụt khỏi tranh để tiến về mặt phẳng băng chuyền
    // (beltZ = CFG.belt.pos[2] trong game gốc; truyền vào nếu cần)
    fallZ(f, boardZ, beltZ) {
      const zT = clamp(
        (this.picBottomY() - f.y) / Math.max(0.01, this.picBottomY() - this.CFG.feedFloorY),
        0, 1
      );
      return lerp(boardZ != null ? boardZ : this.CFG.boardZ, beltZ != null ? beltZ : this.CFG.boardZ, zT);
    }

    // loại bỏ khối khỏi mô phỏng (khi đã được feed lên băng chuyền)
    remove(f) {
      const i = this.fallers.indexOf(f);
      if (i >= 0) this.fallers.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------------------
     VÍ DỤ tích hợp với THREE.js (giống game gốc):

       const phys = new JellyPhysics({ grid: GRID, cellWorld });

       // khi người chơi bấm 1 cụm có thể rơi:
       phys.startFallCluster(cells, (f, r, c, color) => {
         const m = getFaller();               // mesh từ pool của bạn
         m.visible = true;
         m.material.color.setHex(PALETTE[color]);
         hideInstance(cellToId[r][c]);         // ẩn ô tranh tương ứng
         f.mesh = m;
       });

       // trong vòng lặp render mỗi frame:
       phys.update(dt, (f) => {
         const z = phys.fallZ(f, CFG.boardZ, CFG.belt.pos[2]);
         f.mesh.position.set(f.x, f.y, z);
         f.mesh.rotation.set(0, 0, f.ang);
         const sq = Math.max(0.78, Math.min(1.22, 1 - f.vy * 0.02)); // squash theo tốc độ
         f.mesh.scale.set(1/Math.sqrt(sq), sq, 1/Math.sqrt(sq));
       });
     ------------------------------------------------------------------------ */

  return { JellyPhysics, DEFAULT_CONFIG };
});
