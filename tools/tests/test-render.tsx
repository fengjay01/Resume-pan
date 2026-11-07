/**
 * 服务端渲染校验（无需浏览器/dev server）：
 * 1) 头像：只要 basic.avatar 有值，就必须渲染出 <img>；
 * 2) 隐藏模块：visible=false 的模块不得出现在渲染结果中；
 * 3) 空简历：不应渲染出图片。
 */
import { createElement, Fragment } from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { ModuleNav } from '@/components/editor/ModuleNav';
import { buildBlocks } from '@/components/resume/parts';
import { buildTokens } from '@/components/resume/tokens';
import { createSampleResume } from '@/data/sampleResume';
import { TEMPLATES } from '@/data/templates';
import { createResume, createEmptyBasicInfo } from '@/lib/resume';
import type { Resume } from '@/types/resume';

const AVATAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

function render(resume: Resume): string {
  const tokens = buildTokens(resume.style);
  const blocks = buildBlocks(resume, tokens);
  return ReactDOMServer.renderToStaticMarkup(
    createElement(Fragment, null, ...blocks.map((b) => createElement(Fragment, { key: b.key }, b.node))),
  );
}

const base = createSampleResume();

// 1) 上传头像后必须显示
const withAvatar: Resume = { ...base, basic: { ...base.basic, avatar: AVATAR } };
const htmlWithAvatar = render(withAvatar);
const avatarShown = htmlWithAvatar.includes(AVATAR) && htmlWithAvatar.includes('<img');

// 未上传头像时不应有 <img>
const htmlNoAvatar = render({ ...base, basic: { ...base.basic, avatar: '' } });
const noImgWhenEmpty = !htmlNoAvatar.includes('<img');

// 跨全部 22 套模板都要能显示头像
const perTemplate = TEMPLATES.map((t) => {
  const r: Resume = {
    ...withAvatar,
    style: { ...withAvatar.style, templateId: t.id, theme: t.theme, layout: t.layout, infoMode: t.infoMode },
  };
  return { id: t.id, layout: t.layout, ok: render(r).includes(AVATAR) };
});
const allTemplatesOk = perTemplate.every((p) => p.ok);

// 2) 隐藏模块不应出现在渲染结果
const hidden: Resume = {
  ...base,
  sections: base.sections.map((s) => (s.type === 'education' ? { ...s, visible: false } : s)),
};
const htmlHidden = render(hidden);
const hiddenOk = !htmlHidden.includes('西安邮电大学') && htmlHidden.includes('专业技能');

// 3) 真正清空后的简历（新简历现在会预填「默认文案引导」，所以这里手工清空）
const emptied: Resume = {
  ...createResume('tpl-01'),
  basic: { ...createEmptyBasicInfo() },
  sections: createResume('tpl-01').sections.map((s) => ({
    ...s,
    items: [],
    content: '',
  })),
};
const emptyHtml = render(emptied);
const emptyOk = !emptyHtml.includes('<img') && !emptyHtml.includes('教育背景');

console.log('1) 上传头像后渲染出 <img>        :', avatarShown);
console.log('   未上传头像时不渲染 <img>       :', noImgWhenEmpty);
console.log('   22 套模板均能显示头像          :', allTemplatesOk,
  '(' + perTemplate.filter((p) => !p.ok).map((p) => `${p.id}:${p.layout}`).join(',') + ')');
console.log('2) 隐藏模块不出现在渲染结果       :', hiddenOk);
console.log('3) 空简历不渲染图片/空模块        :', emptyOk);

// 4) 模块步骤导航：每个模块都要有「显示/隐藏」开关
const navResume: Resume = {
  ...base,
  sections: base.sections.map((s, i) => (i === 1 ? { ...s, visible: false } : s)),
};
const navHtml = ReactDOMServer.renderToStaticMarkup(
  createElement(ModuleNav, {
    resume: navResume,
    activeId: navResume.sections[1].id,
    onSelect: () => {},
    onRename: () => {},
    onToggleVisible: () => {},
    onMove: () => {},
    onAdd: () => {},
    panelCollapsed: false,
    onTogglePanel: () => {},
  }),
);
const switchCount = (navHtml.match(/role="switch"/g) || []).length;
// 交互改为「悬停才显示」后，显隐开关与前后移按钮移入按需渲染的浮层（fixed 层），
// SSR 静态 HTML 中不再包含；收起/展开面板按钮也移入预览缩放工具条。
const navOk =
  navHtml.includes('基本信息') &&
  navHtml.includes('项目经历') &&
  navHtml.includes('添加模块') &&
  switchCount === 0;
console.log('4) 步骤导航项齐全（含基本信息与各模块）:', navOk);
console.log('   显隐开关已移入悬停浮层（SSR 静态数为 0）:', switchCount === 0, `(${switchCount})`);

const pass =
  avatarShown && noImgWhenEmpty && allTemplatesOk && hiddenOk && emptyOk && navOk;
console.log('\n结果:', pass ? 'PASS ✅' : 'FAIL ❌');
if (!pass) process.exit(1);
