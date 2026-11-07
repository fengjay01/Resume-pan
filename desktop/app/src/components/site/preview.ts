import { SAMPLE_RESUME } from '@/data/sampleResume';
import { applyTemplate, cloneResume } from '@/lib/resume';
import type { Resume } from '@/types/resume';

/**
 * 模板预览缓存：把示例简历套用指定模板，得到「该模板样式下的示例简历」。
 * 结果只依赖模板 id，缓存后避免网格中重复深拷贝。
 */
const cache = new Map<string, Resume>();

export function previewResume(templateId: string): Resume {
  const hit = cache.get(templateId);
  if (hit) return hit;
  const built = applyTemplate(cloneResume(SAMPLE_RESUME, SAMPLE_RESUME.name), templateId);
  cache.set(templateId, built);
  return built;
}
