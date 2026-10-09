/* Static design export for the About section. This is not an HTML/browser render.
 * Uses the website's spacing/colours, exact published copy and unchanged portrait.
 * Run with NODE_PATH pointing to installed skia-canvas, optionally OUTPUT_DIR.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Canvas, loadImage } = require('skia-canvas');

const root = path.resolve(__dirname, '..');
const output = process.env.OUTPUT_DIR || path.join(root, 'qa', 'about-design');
const content = JSON.parse(fs.readFileSync(path.join(root, 'server/site-default.json'), 'utf8'));
const photoPath = path.join(root, 'server/site-default-images/ich.jpeg');
const expected = 'Crazy_Batto\nInhaber und Gründer von Team TABH\n36 Jahre alt\nSocial-Media-Content-Creator für Hardware und Gaming';
if (content.about.text !== expected) throw new Error('Unexpected biography copy');
const sha = crypto.createHash('sha256').update(fs.readFileSync(photoPath)).digest('hex');
if (sha !== '43ce2e759bd796f53da84451067aa816aa88af14bff0596fcc9775b8ad6e9ffc') throw new Error('Portrait differs from supplied original');

function font(ctx, size, weight = 400, tracking = 0) {
  ctx.font = `${weight} ${size}px "DejaVu Sans"`;
  ctx.letterSpacing = `${tracking}px`;
  ctx.textBaseline = 'alphabetic';
}
function inlineWidth(ctx, text, size) {
  return text.split(/(Team TABH)/).reduce((width, part) => {
    font(ctx, size, part === 'Team TABH' ? 700 : 400);
    return width + ctx.measureText(part).width;
  }, 0);
}
function wrapped(ctx, text, maxWidth, inlineSize) {
  const lines = [];
  let line = '';
  for (const word of text.match(/Team TABH|[^ ]+/g) || []) {
    const candidate = line ? line + ' ' + word : word;
    const width = inlineSize ? inlineWidth(ctx, candidate, inlineSize) : ctx.measureText(candidate).width;
    if (line && width > maxWidth) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}
function drawLines(ctx, lines, x, top, size, lineHeight, colour, weight, tracking = 0, inline = false) {
  font(ctx, size, weight, tracking);
  ctx.fillStyle = colour;
  const metrics = ctx.measureText('Hg');
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
  const offset = (lineHeight - ascent - descent) / 2 + ascent;
  lines.forEach((line, index) => {
    const y = top + offset + index * lineHeight;
    if (!inline) return ctx.fillText(line, x, y);
    let left = x;
    for (const part of line.split(/(Team TABH)/)) {
      font(ctx, size, part === 'Team TABH' ? 700 : 400);
      ctx.fillText(part, left, y);
      left += ctx.measureText(part).width;
    }
  });
}

async function exportDesign(photo, width, label) {
  const mobile = width <= 620;
  const margin = width < 360 ? 16 : mobile ? 20 : 56;
  const wrapWidth = width - margin * 2;
  const headingSize = mobile ? 36 : 66;
  const headingLine = headingSize * 1.12;
  const headingTop = mobile ? 39 : 77;
  const underlineY = headingTop + headingLine + (mobile ? 16 : 22);
  const mediaTop = underlineY + (mobile ? 3 : 4) + (mobile ? 27 : 43);
  const photoWidth = mobile ? Math.min(440, wrapWidth) : 530;
  const photoHeight = photoWidth * photo.height / photo.width;
  const textX = mobile ? margin : margin + (wrapWidth - 80) * .84 / 1.84 + 80;
  const textWidth = mobile ? wrapWidth : Math.min(660, (wrapWidth - 80) / 1.84);
  const nameSize = mobile ? 36 : 56;
  const nameLine = nameSize * 1.12;
  const nameMargin = mobile ? 22 : 27;
  const bodySize = mobile ? 18 : 22;
  const bodyLine = bodySize * (mobile ? 1.65 : 1.6);
  const paragraphGap = mobile ? 14 : 17;
  const measurement = new Canvas(width, 1).getContext('2d');
  const values = content.about.text.split('\n');
  font(measurement, nameSize, 700, mobile ? -1 : -1.4);
  const nameLines = wrapped(measurement, values[0], textWidth);
  const paragraphs = values.slice(1).map((value, index) => {
    font(measurement, bodySize, 400);
    return wrapped(measurement, value, textWidth, bodySize);
  });
  const textHeight = nameLines.length * nameLine + nameMargin + paragraphs.reduce((sum, lines) => sum + lines.length * bodyLine, 0) + 2 * paragraphGap;
  const textTop = mobile ? mediaTop + photoHeight + 29 : mediaTop + (photoHeight - textHeight) / 2;
  const height = Math.ceil(Math.max(mediaTop + photoHeight, textTop + textHeight) + (mobile ? 43 : 82));
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#30333b'; ctx.fillRect(margin, 0, wrapWidth, 1);
  drawLines(ctx, [content.about.title], margin, headingTop, headingSize, headingLine, '#f0f0f2', 700, mobile ? -1 : -1.9);
  ctx.fillStyle = '#c62737'; ctx.fillRect(margin, underlineY, mobile ? 48 : 63, mobile ? 3 : 4);
  ctx.save();
  ctx.beginPath(); ctx.roundRect(margin, mediaTop, photoWidth, photoHeight, 4); ctx.clip();
  ctx.drawImage(photo, margin, mediaTop, photoWidth, photoHeight);
  ctx.restore();
  drawLines(ctx, nameLines, textX, textTop, nameSize, nameLine, '#f0f0f2', 700, mobile ? -1 : -1.4);
  let y = textTop + nameLines.length * nameLine + nameMargin;
  paragraphs.forEach((lines, index) => {
    drawLines(ctx, lines, textX, y, bodySize, bodyLine, index === 0 ? '#f0f0f2' : '#c1c3cb', 400, 0, true);
    y += lines.length * bodyLine + (index < 2 ? paragraphGap : 0);
  });
  const filename = `Crazy_Batto-Ueber-mich-Gestaltung-${label}.png`;
  await canvas.toFile(path.join(output, filename));
  return { filename, width, height, method: 'Static canvas composition, not browser screenshot', font: 'DejaVu Sans approximates system-ui; browser font metrics unverified', paragraphLines: [nameLines, ...paragraphs], portraitCrop: false, portraitSourceSha256: sha };
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const photo = await loadImage(photoPath);
  const exports = [];
  for (const [width, label] of [[1536, 'Desktop'], [390, 'Handy']]) exports.push(await exportDesign(photo, width, label));
  fs.writeFileSync(path.join(root, 'qa/about-design-export.json'), JSON.stringify({ staticDesignOnly: true, browserVerified: false, exports }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, exports }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
