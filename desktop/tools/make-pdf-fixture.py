"""生成 PDF 导入功能的测试样本。

用法（需要 PyMuPDF）：
    python tools/make-pdf-fixture.py

产出：
- tools/fixtures/resume-text.pdf       文字版 A4 简历（中文，用于验证「直接提取文字」）
- tools/fixtures/resume-image-300.pdf  把上面那页按 300dpi 光栅化后的图片版（用于验证 OCR）
- app/public/fixtures/resume-text.pdf  文字版副本（小文件，供浏览器测试脚本 fetch）

图片版体积较大（约 25MB），平时不需要保留在仓库里，需要测 OCR 时再生成。
"""
import os
import shutil

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'tools', 'fixtures')
W, H = 595, 842  # A4 pt


def build_text_pdf(path: str) -> pymupdf.Document:
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)

    def line(y, parts):
        """parts: [(x, text, size)]"""
        for x, text, size in parts:
            page.insert_text((x, y), text, fontname='china-s', fontsize=size)

    line(70, [(56, '张三', 20)])
    line(94, [(56, '男 | 25 岁 | 13800000000 | zhangsan@example.com', 10)])
    line(112, [(56, '求职意向：机器人算法工程师', 10)])

    line(150, [(56, '教育背景', 13)])
    page.draw_line(pymupdf.Point(56, 156), pymupdf.Point(W - 56, 156))
    line(176, [(56, '2020.09-2024.06', 10), (170, '某某大学', 10), (300, '自动化（本科）', 10)])
    line(194, [(56, '主修课程：机器人学、控制理论、计算机视觉、数据结构与算法。', 10)])

    line(228, [(56, '工作经历', 13)])
    page.draw_line(pymupdf.Point(56, 234), pymupdf.Point(W - 56, 234))
    line(254, [(56, '2024.07-至今', 10), (170, '某某科技有限公司', 10), (340, '算法工程师', 10)])
    line(272, [(56, '主要工作：', 10)])
    line(290, [(70, '• 负责视觉定位与运动控制模块开发，与多团队共同推进整机联调。', 10)])
    line(308, [(70, '• 推动插枪成功率由 90% 提升至 99%，单流程时间压缩至约 30 秒。', 10)])

    line(346, [(56, '项目经历', 13)])
    page.draw_line(pymupdf.Point(56, 352), pymupdf.Point(W - 56, 352))
    line(372, [(56, '2023.03-2023.12', 10), (170, '智能问答机器人', 10), (340, '核心开发', 10)])
    line(390, [(56, '基于 RAG 构建知识库问答链路，准确率达 92%；负责检索与重排模块优化。', 10)])

    line(428, [(56, '专业技能', 13)])
    page.draw_line(pymupdf.Point(56, 434), pymupdf.Point(W - 56, 434))
    line(454, [(56, '编程语言：Python、C++、TypeScript，熟悉常用数据结构与算法。', 10)])
    line(472, [(56, '框架工具：PyTorch、ROS、OpenCV、Docker、Git。', 10)])

    line(510, [(56, '获奖情况', 13)])
    page.draw_line(pymupdf.Point(56, 516), pymupdf.Point(W - 56, 516))
    line(536, [(56, '2023.10　全国大学生机器人大赛一等奖', 10)])
    line(554, [(56, '2022.05　校级一等奖学金', 10)])

    line(592, [(56, '自我评价', 13)])
    page.draw_line(pymupdf.Point(56, 598), pymupdf.Point(W - 56, 598))
    line(618, [(56, '踏实肯干，乐于协作，具备较强的工程落地能力与问题定位能力。', 10)])

    doc.save(path)
    return doc


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    text_path = os.path.join(OUT_DIR, 'resume-text.pdf')
    doc = build_text_pdf(text_path)
    print('已生成', text_path)

    # 浏览器测试要能 fetch 到它：小体积，放到 public 下（测试脚本用 /fixtures/resume-text.pdf）
    public_dir = os.path.join(ROOT, 'app', 'public', 'fixtures')
    os.makedirs(public_dir, exist_ok=True)
    shutil.copyfile(text_path, os.path.join(public_dir, 'resume-text.pdf'))
    print('已复制到 app/public/fixtures/resume-text.pdf')

    # 图片版：把第一页按 300dpi 光栅化后塞进新 PDF（模拟扫描件 / html2canvas 导出的图片型 PDF）
    pix = doc[0].get_pixmap(dpi=300)
    img_doc = pymupdf.open()
    page = img_doc.new_page(width=W, height=H)
    page.insert_image(pymupdf.Rect(0, 0, W, H), stream=pix.tobytes('png'))
    image_path = os.path.join(OUT_DIR, 'resume-image-300.pdf')
    img_doc.save(image_path)
    print('已生成', image_path, f'({pix.width}x{pix.height})')


if __name__ == '__main__':
    main()
