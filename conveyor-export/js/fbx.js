// fbx.js — nạp model FBX từ file (.fbx) ở runtime.
// Thay cho cách cũ: decode base64 nhúng inline rồi parse sync.
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const loader = new FBXLoader();

// Trả về Promise<Group>. Dùng: const obj = await loadFbx('assets/bucket1.fbx');
export function loadFbx(url) {
  return loader.loadAsync(url);
}
