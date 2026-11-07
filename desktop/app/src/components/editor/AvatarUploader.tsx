import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageUp, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { RangeSlider } from '@/components/common/Form';

const ACCEPT = 'image/png,image/jpeg';
const MAX_SIZE = 1024 * 1024; // 1 MB

/**
 * 头像统一按 **4:5 竖版** 处理：裁剪视窗、编辑器预览、简历上的头像三者比例完全一致。
 * 240×300 与 320×400 都精确等于 4:5（可被 4 / 5 整除，避免半像素）。
 */
const VIEW_W = 240;
const VIEW_H = 300;
const OUT_W = 320;
const OUT_H = 400;
/** 与简历渲染保持一致的小圆角 */
export const AVATAR_RADIUS = 6;

interface CropMetrics {
  scale: number;
  drawW: number;
  drawH: number;
}

function metricsFor(img: HTMLImageElement, viewW: number, viewH: number, zoom: number): CropMetrics {
  const base = Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight);
  const scale = base * zoom;
  return { scale, drawW: img.naturalWidth * scale, drawH: img.naturalHeight * scale };
}

function clampOffset(
  offset: { x: number; y: number },
  img: HTMLImageElement,
  zoom: number,
): { x: number; y: number } {
  const { drawW, drawH } = metricsFor(img, VIEW_W, VIEW_H, zoom);
  const maxX = Math.max(0, (drawW - VIEW_W) / 2);
  const maxY = Math.max(0, (drawH - VIEW_H) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

/** 头像上传 + Canvas 裁剪弹窗（固定 4:5 竖版） */
export function AvatarUploader({
  avatar,
  onChange,
}: {
  avatar: string;
  onChange: (dataUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const [error, setError] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cropOpen, setCropOpen] = useState(false);

  const resetCrop = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const { drawW, drawH } = metricsFor(img, VIEW_W, VIEW_H, zoom);
    const dx = VIEW_W / 2 + offset.x - drawW / 2;
    const dy = VIEW_H / 2 + offset.y - drawH / 2;
    ctx.drawImage(img, dx, dy, drawW, drawH);

    // 裁剪框描边（画布本身即裁剪区域）
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, VIEW_W - 2, VIEW_H - 2);
    ctx.restore();
  }, [img, offset.x, offset.y, zoom]);

  useEffect(() => {
    if (cropOpen) draw();
  }, [draw, cropOpen]);

  const handleFile = (file: File) => {
    setError('');
    if (!/image\/(png|jpeg)/.test(file.type)) {
      setError('仅支持 JPG、PNG、JPEG 格式的图片');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('图片大小不能超过 1 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      if (!url) {
        setError('头像上传失败，请稍后重试');
        return;
      }
      const image = new Image();
      image.onload = () => {
        setImg(image);
        resetCrop();
        setCropOpen(true);
      };
      image.onerror = () => setError('头像上传失败，请稍后重试');
      image.src = url;
    };
    reader.onerror = () => setError('头像上传失败，请稍后重试');
    reader.readAsDataURL(file);
  };

  const changeZoom = (v: number) => {
    setZoom(v);
    if (img) setOffset((prev) => clampOffset(prev, img, v));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragRef.current;
    if (!start || !img) return;
    setOffset(
      clampOffset(
        { x: start.ox + (e.clientX - start.x), y: start.oy + (e.clientY - start.y) },
        img,
        zoom,
      ),
    );
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const confirmCrop = () => {
    try {
      if (!img) throw new Error('missing image');
      const canvas = document.createElement('canvas');
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');

      const k = OUT_W / VIEW_W;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const { drawW, drawH } = metricsFor(img, OUT_W, OUT_H, zoom);
      ctx.drawImage(
        img,
        OUT_W / 2 + offset.x * k - drawW / 2,
        OUT_H / 2 + offset.y * k - drawH / 2,
        drawW,
        drawH,
      );

      onChange(canvas.toDataURL('image/jpeg', 0.88));
      setCropOpen(false);
      setError('');
    } catch {
      setError('图片裁剪失败，请重试');
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-5 py-5 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        {avatar ? (
          <img
            src={avatar}
            alt="头像预览"
            className="border border-ink-200 object-cover"
            style={{
              width: 64,
              height: 80, // 4:5 竖版
              borderRadius: AVATAR_RADIUS,
            }}
          />
        ) : (
          <div
            className="flex items-center justify-center border border-dashed border-ink-300 bg-white text-ink-300"
            style={{ width: 64, height: 80, borderRadius: AVATAR_RADIUS }}
          >
            <ImageUp size={24} />
          </div>
        )}
        <p className="text-xs leading-relaxed text-ink-500">
          支持 JPG、PNG、JPEG 格式，大小不超过 1 MB · 按 4:5 竖版裁剪
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} />
            上传头像
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            disabled={!avatar}
            onClick={() => {
              setError('');
              onChange('');
            }}
          >
            <Trash2 size={14} />
            移除头像
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      <Modal
        open={cropOpen && !!img}
        onClose={() => setCropOpen(false)}
        title="裁剪头像（4:5 竖版）"
        width={400}
        footer={
          <>
            <Button variant="outline" onClick={() => setCropOpen(false)}>
              取消
            </Button>
            <Button onClick={confirmCrop}>确认上传</Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4">
          <p className="self-start text-[13px] text-ink-500">请拖动图像调整范围，上传前可缩放</p>
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className="cursor-move touch-none bg-ink-100"
            style={{ width: VIEW_W, height: VIEW_H, borderRadius: AVATAR_RADIUS }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <div className="w-full">
            <p className="mb-1.5 text-[13px] font-medium text-ink-700">缩放</p>
            <RangeSlider
              value={zoom}
              min={1}
              max={3}
              step={0.01}
              onChange={changeZoom}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
