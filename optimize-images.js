// Compress wedding photos for web delivery.
// - Resizes longest side to 1800px (perfect for desktop + retina)
// - Re-encodes JPEG at quality ~82 (visually lossless on screens)
// - Backs originals up to Image-orig/ before overwriting
//
// Usage: node optimize-images.js
// Requires: ffmpeg in PATH (already verified).

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC    = path.resolve(__dirname, 'Image');
const BACKUP = path.resolve(__dirname, 'Image-orig');
const MAX_DIM = 1800;     // longest side
const QUALITY = 4;         // ffmpeg -q:v scale 1-31 (lower = better; 4≈Q82)

if (!fs.existsSync(SRC)) {
  console.error('Source folder missing:', SRC);
  process.exit(1);
}
if (!fs.existsSync(BACKUP)) fs.mkdirSync(BACKUP, { recursive: true });

const files = fs.readdirSync(SRC).filter(f => /\.jpe?g$/i.test(f));
if (!files.length) { console.log('No .jpg files in', SRC); process.exit(0); }

console.log(`\n  Found ${files.length} JPEG(s) in Image/\n  Backing originals up to Image-orig/\n  Resizing to max ${MAX_DIM}px · quality ${QUALITY} (q:v scale)\n`);

let totalBefore = 0, totalAfter = 0, errors = 0;

files.forEach((file, i) => {
  const src    = path.join(SRC, file);
  const backup = path.join(BACKUP, file);
  const tmp    = path.join(SRC, '.tmp_' + file.replace(/\s+/g, '_'));
  const beforeSize = fs.statSync(src).size;
  totalBefore += beforeSize;

  // Skip if backup already exists — means we already optimised this one
  if (fs.existsSync(backup)) {
    totalAfter += beforeSize;
    console.log(`[${(i+1).toString().padStart(2)}/${files.length}] ${file.padEnd(34)} → already optimised (${(beforeSize/1024/1024).toFixed(2)} MB)`);
    return;
  }

  try {
    // Resize keeping aspect-ratio; -vf scale uses 'force_original_aspect_ratio=decrease'
    // -compression_level / -q:v -> quality control for mjpeg/jpeg encoder
    const cmd = `ffmpeg -y -loglevel error -i "${src}" -vf "scale='if(gt(iw,ih),min(${MAX_DIM},iw),-2)':'if(gt(ih,iw),min(${MAX_DIM},ih),-2)'" -q:v ${QUALITY} "${tmp}"`;
    execSync(cmd, { stdio: 'pipe' });

    // Backup original then atomically replace
    fs.copyFileSync(src, backup);
    fs.renameSync(tmp, src);

    const afterSize = fs.statSync(src).size;
    totalAfter += afterSize;
    const ratio = (100 - (afterSize / beforeSize * 100)).toFixed(0);
    console.log(`[${(i+1).toString().padStart(2)}/${files.length}] ${file.padEnd(34)} ${(beforeSize/1024/1024).toFixed(2).padStart(6)} MB → ${(afterSize/1024/1024).toFixed(2).padStart(5)} MB  (-${ratio}%)`);
  } catch (e) {
    errors++;
    console.log(`[${(i+1).toString().padStart(2)}/${files.length}] ${file.padEnd(34)} ✗ ERROR: ${(e.stderr || e.message).toString().split('\n')[0]}`);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

console.log(`
  ┌─────────────────────────────────────────────
  │  Before:  ${(totalBefore/1024/1024).toFixed(1).padStart(7)} MB
  │  After:   ${(totalAfter /1024/1024).toFixed(1).padStart(7)} MB
  │  Saved:   ${((totalBefore-totalAfter)/1024/1024).toFixed(1).padStart(7)} MB  (${(100-totalAfter/totalBefore*100).toFixed(1)}% smaller)
  │  Errors:  ${errors}
  └─────────────────────────────────────────────

  Originals safely kept in Image-orig/  (recommend adding to .gitignore)
`);
