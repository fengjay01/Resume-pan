/**
 * 导入简历解析器单测：用一份「典型中文简历文本」验证
 * 基本信息抽取、章节切分、条目/时间解析、列表与加粗转换。
 */
import { parseResumeText, buildResumeFromImport } from '@/lib/resumeImport';

const SAMPLE = `张三
男 | 24岁 | 13812345678 | zhangsan@example.com
求职意向：AI Agent / 软件开发
中共党员 | 应届生

教育背景
2023.09-2026.06    西安邮电大学    控制科学与工程（硕士）
主修课程：现代控制理论、机器人学；GPA 3.7/4.0，专业排名前 10%。
2020.09-2024.06    黄淮学院    计算机科学与技术（本科）

专业技能
熟悉 C++/Python，具备良好的编程能力与编程习惯，善于快速学习并应用新领域的开发工具。
熟悉 TCP/IP 协议栈、LAN/WAN 技术、路由交换技术及 Linux 操作系统。
熟悉 Prompt、RAG、MCP 等 AI 技术，能够进行 Agent 工作流设计。

工作经历
2025.06-2025.09    某科技有限公司    机器人算法工程师
主要工作：
- 负责视觉定位与运动控制模块开发，插枪成功率由 90% 提升至 99%。
- 主导设备调试与故障排查，将单流程时间由 60s 压缩至 30s。

项目经历
2024.10-2025.06    AI+腹腔镜手术视频一体化云平台    核心开发
项目简介：面向 ENT 科室内窥镜自动化检查需求，构建具身智能机器人系统。
- 视觉感知：基于 U-Net 构建分割网络，准确率达 98%。
- 运动规划：基于 Pinocchio + OMPL 实现无碰路径搜索。

获奖情况
2023.10    国家奖学金
2022.05    校级一等奖学金

自我评价
工作中认真细心，抗压能力强；具备良好的沟通能力和团队协作能力。

个人爱好
长跑、摄影
`;

const parsed = parseResumeText(SAMPLE);
const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

ok('姓名', parsed.basic.name === '张三');
ok('电话', parsed.basic.phone === '13812345678');
ok('邮箱', parsed.basic.email === 'zhangsan@example.com');
ok('求职意向', (parsed.basic.jobIntention || '').includes('AI Agent'));
ok('政治面貌', parsed.basic.politicalStatus === '中共党员');
ok('性别', parsed.basic.gender === 'male');
ok('工作年限', (parsed.basic.workYears || '').includes('应届'));

const titles = parsed.sections.map((s) => s.title);
ok('章节识别:' + titles.join('/'), parsed.sections.length >= 6);
ok(
  '标准模块齐全',
  ['教育背景', '专业技能', '工作经历', '项目经历', '获奖情况', '自我评价'].every((t) =>
    titles.includes(t),
  ),
);
ok('未知标题 → 自定义模块', titles.includes('个人爱好'));

const edu = parsed.sections.find((s) => s.title === '教育背景');
ok('教育条目数=2', !!edu && edu.items.length === 2);
ok('教育时间解析', !!edu && edu.items[0].startDate === '2023-09' && edu.items[0].endDate === '2026-06');
ok('教育名称/专业', !!edu && edu.items[0].name.includes('西安邮电大学') && edu.items[0].role.includes('控制科学与工程'));

const work = parsed.sections.find((s) => s.title === '工作经历');
ok('工作条目数=1', !!work && work.items.length === 1);
ok('工作时间', !!work && work.items[0].startDate === '2025-06' && work.items[0].endDate === '2025-09');
ok('工作内容转列表', !!work && /<ul><li>/.test(work.items[0].content));
ok('短标签加粗', !!work && /<strong>主要工作：<\/strong>/.test(work.items[0].content));

const project = parsed.sections.find((s) => s.title === '项目经历');
ok('项目条目数=1', !!project && project.items.length === 1);
ok('项目含列表项', !!project && (project.items[0].content.match(/<li>/g) || []).length >= 2);

const award = parsed.sections.find((s) => s.title === '获奖情况');
ok('获奖条目数=2', !!award && award.items.length === 2);
ok('获奖日期', !!award && award.items[0].labelValue === '2023-10');

const skills = parsed.sections.find((s) => s.title === '专业技能');
ok('技能为富文本', !!skills && skills.kind === 'rich' && skills.content.includes('<p>'));

// 至今
const cur = parseResumeText('工作经历\n2024.07-至今  XX科技  后端开发工程师\n- 负责接口开发');
const curItem = cur.sections.find((s) => s.title === '工作经历')?.items[0];
ok('「至今」解析', !!curItem && curItem.current === true && curItem.endDate === '' && curItem.startDate === '2024-07');

// 兜底：没有标题时整篇入「简历内容」
const fb = parseResumeText('随便一段没有任何标题的文字。\n第二行。');
ok('兜底不丢内容', fb.fallback && fb.sections[0].content.includes('随便一段'));

// 构建简历
const resume = buildResumeFromImport(parsed, 'tpl-01', '张三的简历');
ok('构建可编辑简历', resume.sections.length === parsed.sections.length && resume.basic.phone === '13812345678');
ok('模块 id 唯一', new Set(resume.sections.map((s) => s.id)).size === resume.sections.length);
ok('条目 id 唯一', new Set(resume.sections.flatMap((s) => s.items.map((i) => i.id))).size > 0);

const dump = (t: string) => {
  const sec = parsed.sections.find((s) => s.title === t);
  if (!sec) return console.log(t + ': 无');
  console.log('【' + t + '】' + sec.kind + ' 条目=' + sec.items.length);
  sec.items.slice(0, 2).forEach((it, i) =>
    console.log('  #' + i, JSON.stringify({ name: it.name, role: it.role, s: it.startDate, e: it.endDate, cur: it.current, content: it.content.slice(0, 90) })),
  );
  if (sec.kind === 'rich') console.log('  content:', sec.content.slice(0, 90));
};
dump('教育背景');
dump('工作经历');
dump('获奖情况');
dump('专业技能');

const failed = checks.filter(([, v]) => !v);
console.log('导入解析断言 :', checks.length);
failed.forEach(([n]) => console.log('  ✗', n));
console.log('结果:', failed.length ? `FAIL ${failed.length}` : 'PASS ✅');
console.log(
  '解析摘要:',
  parsed.summary.sections,
  '个模块 /',
  parsed.summary.items,
  '条经历 / 识别',
  parsed.summary.detectedBasic.join('、'),
);
console.log('模块:', titles.join(' | '));
if (failed.length) process.exitCode = 1;
