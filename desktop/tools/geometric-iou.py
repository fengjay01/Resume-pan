"""
矢量导出 PDF vs 预览的几何一致性证明：
1) 1px 容差 IoU（膨胀后仍不重叠的差异才是真几何差异，其余是抗锯齿）
2) 分通道统计漏画/多画
"""
from PIL import Image
import numpy as np
import sys


def dilate(m):
    out = m.copy()
    out[1:, :] |= m[:-1, :]
    out[:-1, :] |= m[1:, :]
    out[:, 1:] |= m[:, :-1]
    out[:, :-1] |= m[:, 1:]
    return out


for page in sys.argv[1:]:
    n = page.rsplit('-', 1)[-1].split('.')[0]
    ref = np.asarray(Image.open(f'shots/fid-user/ref-p{page[-1]}.png').convert('L'), dtype=np.float32)
    pdf = np.asarray(Image.open(f'shots/fid-user/pdf-p{page[-1]}.png').convert('L'), dtype=np.float32)
    H = min(ref.shape[0], pdf.shape[0]); W = min(ref.shape[1], pdf.shape[1])
    ir = ref[:H, :W] < 170
    ip = pdf[:H, :W] < 170
    hit = (ir & ip).sum()
    miss = (ir & ~ip).sum()
    extra = (ip & ~ir).sum()
    raw_iou = 100 * hit / (hit + miss + extra)
    # 1px 容差：预览有墨、导出 1px 邻域内也有墨 → 视为抗锯齿差异
    miss_tol = (ir & ~dilate(ip)).sum()
    extra_tol = (ip & ~dilate(ir)).sum()
    tol_iou = 100 * hit / (hit + miss_tol + extra_tol)
    print(f'{page}: 原始IoU={raw_iou:.2f}%  1px容差IoU={tol_iou:.2f}%  '
          f'真漏画={miss_tol}  真多画={extra_tol}  (原始漏画={miss} 多画={extra})')
