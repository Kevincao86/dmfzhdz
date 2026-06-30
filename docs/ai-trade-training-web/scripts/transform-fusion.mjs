#!/usr/bin/env node
/**
 * Transform hero-slide (left text / right image) → slide-fusion (overlay + content)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '../index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

function extractHeader(body) {
  let rest = body.trimStart();
  let tag = '';
  let h2 = '';
  let lead = '';

  const tagMatch = rest.match(/^<span class="slide-tag">[\s\S]*?<\/span>\s*/);
  if (tagMatch) {
    tag = tagMatch[0].trim();
    rest = rest.slice(tagMatch[0].length);
  }

  const h2Match = rest.match(/^<h2>[\s\S]*?<\/h2>\s*/);
  if (h2Match) {
    h2 = h2Match[0].trim();
    rest = rest.slice(h2Match[0].length);
  }

  const leadMatch = rest.match(/^<p class="lead"[\s\S]*?<\/p>\s*/);
  if (leadMatch) {
    lead = leadMatch[0].trim();
    rest = rest.slice(leadMatch[0].length);
  }

  return { tag, h2, lead, content: rest.trim() };
}

function fusionBlock(img, tag, h2, lead, content, extraClass = '') {
  const overlayParts = [tag, h2, lead].filter(Boolean).join('\n      ');
  const cls = extraClass ? ` slide-fusion ${extraClass}` : ' slide-fusion';
  return `<div class="slide-inner${cls}">
  <div class="visual-band">
    ${img}
    <div class="visual-overlay">
      ${overlayParts}
    </div>
  </div>
  <div class="content-body">
    ${content}
  </div>
</div>`;
}

// hero-slide blocks
html = html.replace(
  /<div class="slide-inner hero-slide(?:[^"]*)">\s*<div class="hero-copy">\s*([\s\S]*?)<\/div>\s*<div class="hero-img(?:[^"]*)">\s*(<img[\s\S]*?>)\s*<\/div>\s*<\/div>/g,
  (_, copyBody, img) => {
    const { tag, h2, lead, content } = extractHeader(copyBody);
    const extra = img.includes('cover-hero') ? 'fusion-cover' : '';
    return fusionBlock(img, tag, h2, lead, content, extra);
  }
);

// slide 7 / 9 style: standalone image strip
html = html.replace(
  /<div class="slide-inner">\s*(<span class="slide-tag">[\s\S]*?<\/span>)\s*(<h2>[\s\S]*?<\/h2>)\s*(<p class="lead"[\s\S]*?<\/p>)\s*<div class="hero-img interactive-img"[^>]*>\s*(<img[\s\S]*?>)\s*<\/div>\s*([\s\S]*?)<\/div>\s*<\/section>/g,
  (_, tag, h2, lead, img, content) => {
    return `${fusionBlock(img, tag.trim(), h2.trim(), lead.trim(), content.trim())}
        </section>`;
  }
);

fs.writeFileSync(htmlPath, html);
console.log('Transformed index.html to slide-fusion layout');
