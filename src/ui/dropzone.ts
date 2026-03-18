export function initDropzone(onFile: (file: File) => void): void {
  const dropzone = document.getElementById('dropzone') as HTMLDivElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) onFile(file);
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('video/')) {
      onFile(file);
    }
  });
}
