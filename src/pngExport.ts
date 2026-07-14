function stylesheetText() {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText);
    } catch {
      // Ignore cross-origin stylesheets. The planner's own Vite CSS is same-origin.
    }
  }
  return chunks.join('\n');
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image data.'));
    reader.readAsDataURL(blob);
  });
}

async function inlineSvgImages(svg: SVGSVGElement) {
  const images = Array.from(svg.querySelectorAll('image'));
  await Promise.all(images.map(async (image) => {
    const href = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!href || href.startsWith('data:')) return;

    const response = await fetch(new URL(href, window.location.href));
    if (!response.ok) throw new Error(`Unable to load image asset: ${href}`);
    const dataUrl = await blobToDataUrl(await response.blob());
    image.setAttribute('href', dataUrl);
    image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
  }));
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The browser could not render the exported SVG.'));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not create the PNG file.'));
    }, 'image/png');
  });
}

function cleanFilename(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'layout';
}

/** Exports a clean, high-resolution PNG of the planner SVG. */
export async function exportPlannerSvgToPng(
  sourceSvg: SVGSVGElement,
  layoutName: string,
  scale = 2,
) {
  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  clone.querySelectorAll('.selected, .primary-selected, .dragging').forEach((element) => {
    element.classList.remove('selected', 'primary-selected', 'dragging', 'drag-valid', 'drag-invalid');
  });
  clone.querySelectorAll('.marquee-selection').forEach((element) => element.remove());

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = stylesheetText();
  clone.insertBefore(style, clone.firstChild);
  await inlineSvgImages(clone);

  const viewBox = sourceSvg.viewBox.baseVal;
  const width = viewBox.width || sourceSvg.clientWidth;
  const height = viewBox.height || sourceSvg.clientHeight;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas export is unavailable in this browser.');

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await canvasBlob(canvas);
    const pngUrl = URL.createObjectURL(png);
    try {
      const anchor = document.createElement('a');
      anchor.href = pngUrl;
      anchor.download = `${cleanFilename(layoutName)}.png`;
      anchor.click();
    } finally {
      URL.revokeObjectURL(pngUrl);
    }
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
