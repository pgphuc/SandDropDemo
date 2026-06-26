/* ============================================================
   jelly-colors.js
   Bảng màu (palette) dùng cho Jelly Drop 3D + các helper màu.
   Tách từ Jelly_Drop_3D.html để copy sang project khác.

   Cách dùng:
     - Trình duyệt (global):  <script src="jelly-colors.js"></script>  -> window.JellyColors
     - ES module:             import { PALETTE, hex, nearestPalette } from './jelly-colors.js'
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JellyColors = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------
     PALETTE — 7 màu jelly, lưu dưới dạng số hex 0xRRGGBB.
     Thứ tự (index) được dùng làm "color id" trong lưới (GRID):
       0 = đỏ        (red)
       1 = cam       (orange)
       2 = vàng      (yellow)
       3 = xanh lá   (green)
       4 = xanh dương(blue)
       5 = chàm      (indigo)
       6 = tím       (purple)
     ------------------------------------------------------------ */
  const PALETTE = [
    0xe8403a, // 0 red
    0xf08a2c, // 1 orange
    0xf5c531, // 2 yellow
    0x5fb84f, // 3 green
    0x2f8fd0, // 4 blue
    0x3a52b0, // 5 indigo
    0x9c4fd0, // 6 purple
  ];

  // Một vài màu phụ trợ của scene (không thuộc palette jelly nhưng đang được dùng)
  const SCENE_COLORS = {
    background:   0xbfd0ec, // nền scene
    hemiGround:   0x8090b0, // màu đất của HemisphereLight
    fillLight:    0xcfe0ff, // đèn fill
    flashBlocked: 0xff2020, // màu nhấp nháy khi cụm jelly bị chặn không rơi được
  };

  /* ------------------------------------------------------------
     hex(i) -> chuỗi CSS '#rrggbb' cho palette index i.
     ------------------------------------------------------------ */
  function hex(i) {
    return '#' + PALETTE[i].toString(16).padStart(6, '0');
  }

  /* ------------------------------------------------------------
     rgb(i) -> {r,g,b} (0..255) cho palette index i.
     ------------------------------------------------------------ */
  function rgb(i) {
    const p = PALETTE[i];
    return { r: (p >> 16) & 255, g: (p >> 8) & 255, b: p & 255 };
  }

  /* ------------------------------------------------------------
     nearestPalette(r,g,b) -> index của màu palette gần nhất
     (khoảng cách bình phương trong không gian RGB).
     Dùng để "snap" pixel của ảnh nguồn về đúng 7 màu jelly.
     ------------------------------------------------------------ */
  function nearestPalette(r, g, b) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < PALETTE.length; i++) {
      const p = PALETTE[i], pr = (p >> 16) & 255, pg = (p >> 8) & 255, pb = p & 255;
      const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  return { PALETTE, SCENE_COLORS, hex, rgb, nearestPalette };
});
