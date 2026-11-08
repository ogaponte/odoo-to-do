const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Embed clipboard/file images in the HTML saved by the existing offline outbox. */
export async function imagesToHtml(files: File[]): Promise<string> {
  for (const file of files) {
    if (!IMAGE_TYPES.has(file.type)) throw new Error('Use PNG, JPEG, GIF or WebP images.');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Each image must be smaller than 5 MB.');
  }
  if (files.reduce((size, file) => size + file.size, 0) > 10 * 1024 * 1024) {
    throw new Error('Please insert no more than 10 MB of images at a time.');
  }

  const images = await Promise.all(files.map(async (file) => {
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the image. Please try again.'));
      reader.onabort = () => reject(new Error('Image insertion was canceled.'));
      reader.readAsDataURL(file);
    });
    const image = document.createElement('img');
    image.src = src;
    image.alt = file.name || 'Pasted image';
    image.setAttribute('data-file-name', image.alt);
    return `<p>${image.outerHTML}</p>`;
  }));
  return images.join('') + '<p><br></p>';
}
