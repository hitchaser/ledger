import { useRef } from 'react';
import { Camera, X } from 'lucide-react';
import Avatar from './Avatar';

function resizeImage(file, maxSize = 200) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
        else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function AvatarUpload({ src, name, onUpload, onRemove }) {
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file);
    onUpload(dataUrl);
    e.target.value = '';
  };

  return (
    <div className="relative group inline-block">
      <Avatar src={src} name={name} size="xl" />
      <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity cursor-pointer"
        onClick={() => inputRef.current?.click()}>
        <Camera size={18} className="text-white" />
      </div>
      {src && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <X size={10} className="text-zinc-400" />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}
