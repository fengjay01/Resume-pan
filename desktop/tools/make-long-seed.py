"""构造一份「复现用户问题」的种子数据：教育背景/专业技能较短，项目经历很长。

用法：在项目根目录执行
    python tools/make-long-seed.py
"""
import json
import os

SRC = "tools/seeds/seed-sample.json"
DST = "tools/seeds/seed-long.json"

d = json.load(open(SRC, encoding="utf-8"))
resume = d["xl-resume-data"]["state"]["resumes"][0]

def item(i, name, role, label, label_value, start, end, content):
    return {
        "id": f"it-long-{i}",
        "name": name,
        "role": role,
        "label": label,
        "labelValue": label_value,
        "startDate": start,
        "endDate": end,
        "current": False,
        "content": content,
    }

SKILLS = (
    "<ul>"
    "<li>熟悉 Figma、Axure、Visio、XMind、PPT 等工具，具备需求分析、产品原型设计及 PRD 撰写能力。</li>"
    "<li>熟悉 C++/Python，具备良好的编程能力与编程习惯，善于快速学习并应用新领域的开发工具。</li>"
    "<li>熟悉 TCP/IP 协议栈、LAN/WAN 技术、路由交换技术及 Linux 操作系统。</li>"
    "<li>熟悉 Prompt、RAG、MCP、Skill、Harness 等 AI 技术，能够进行 Agent 工作流设计、工具调用及方案设计。</li>"
    "<li>熟悉 Claude Code、Codex 等 AI Coding 工具，具备从项目需求、原型设计到代码实现的快速验证能力。</li>"
    "</ul>"
)

P1 = (
    "<p><strong>项目介绍：</strong>面向腹腔镜手术视频「准准、难瓣、难复查、难质控」的临床痛点，交付「采集终端 + 智能算法 + 云平台」三位一体的医疗影像系统，覆盖术中辅助诊疗、术后质量评估、教学复盘、数据加密全流程。</p>"
    "<p><strong>主要工作：</strong></p>"
    "<ul>"
    "<li><strong>需求与产品：</strong>主导多家三甲医院 2 轮实地调研，分析用户痛点与业务流程，完成需求分析、PRD 及产品原型设计，梳理 AI 功能与业务场景的结合模式，推动 AI 能力转化为可落地的产品功能。</li>"
    "<li><strong>Agent 流程设计：</strong>围绕手术视频分析、质量评估等场景，设计「任务解析—工具调用—AI 处理—结果输出」的 Agent 自动化工作流，明确各环节输入输出及任务流转逻辑，提升复杂任务的自动化处理能力。</li>"
    "<li><strong>项目交付：</strong>协调算法、开发、测试全流程，负责任务拆解、进度管理与质量检查，协调团队推进关键功能开发与测试，推动系统从需求分析、方案设计到实际落地使用。</li>"
    "</ul>"
    "<p><strong>项目成果：</strong>① 实现 2 小时手术视频 10 分钟智能处理，交付医院实际使用。② 入驻西安邮电大学第十一季孵化基地（2025 年），获 6000 万元启动基金。③ 获得第二十届中国研究生电子设计竞赛全国总决赛团队二等奖。④ 获得「华为杯」第七届中国研究生人工智能创新大赛全国总决赛团队三等奖。</p>"
)

P2 = (
    "<p><strong>项目介绍：</strong>面向耳鼻喉（ENT）科室内窥镜检查需求，构建基于具身智能的内窥镜机器人系统。</p>"
    "<p><strong>主要工作：</strong></p>"
    "<ul>"
    "<li><strong>项目规划：</strong>围绕 ENT 科室内窥镜自动化检查需求开展需求调研与方案规划，制定「仿真搭建—数据集采—模型训练—模型部署」4 阶段项目计划，拆解 2 个仿真场景、4 类机器人任务及阶段交付物，明确里程碑与验收标准。</li>"
    "<li><strong>项目推进：</strong>协调开发、算法及临床团队推进实施，建立项目周报、进度跟踪、问题清单机制，针对低算力约束、仿真与真机差异等风险，组织技术方案评审，协调资源，推动问题闭环。</li>"
    "<li><strong>规范建设：</strong>制定多模态数据采集规范及阶段验收标准，建立「采集—预处理—质量检查—实验验证」全流程管理机制，推动项目流程标准化，完成 200+ 条高质量数据采集及数据格式标准化。</li>"
    "<li><strong>落地闭环：</strong>统筹数据、模型训练与推理、测试验证及真机调试等研发环节，针对模型泛化、仿真与真机差异等关键问题推动 LORA、知识蒸馏、域随机化等方案验证与迭代，完成项目由仿真验证向真机应用阶段的落地。</li>"
    "</ul>"
    "<p><strong>项目成果：</strong>① 完成 200+ 条高质量多模态数据采集及标准化，建立数据质量管理机制；② 通过 LoRA 微调、知识隔离优化模型训练方案，降低 GPU 资源需求；③ 通过数据增强、域随机化提升模型对真实环境的适应能力，实际操作成功率从约 66% 提升至约 87%。</p>"
)

# 只保留用户问题截图里的三个模块，其余清空，模拟「一页填不满就分页」
for s in resume["sections"]:
    t = s["type"]
    if t == "education":
        s["items"] = [
            item(1, "西安邮电大学", "控制科学与工程", "学历", "硕士", "2024-09", "2027-06",
                 "<p>主修课程：现代控制理论、机器人学、最优估计与滤波、模式识别与机器学习。</p>"),
            item(2, "黄淮学院", "计算机科学与技术", "学历", "本科", "2020-09", "2024-06",
                 "<p>GPA 3.7/4.0，专业排名前 10%，连续三年获校级奖学金。</p>"),
        ]
    elif t == "skills":
        s["content"] = SKILLS
    elif t == "project":
        s["items"] = [
            item(3, "AI+腹腔镜手术视频一体化云平台", "第四军医大学唐都医院", "", "", "2024-10", "2025-06", P1),
            item(4, "基于VLA的具身智能内窥镜机器人", "矩衡（西安）智能科技有限公司", "", "", "2025-09", "2026-03", P2),
        ]
    elif s["kind"] == "list":
        s["items"] = []
    else:
        s["content"] = ""

resume["name"] = "长项目经历-分页测试"
json.dump(d, open(DST, "w", encoding="utf-8"), ensure_ascii=False)
print("已写入", os.path.abspath(DST))
print("模块:", [(s["title"], len(s["items"]) if s["kind"] == "list" else "rich") for s in resume["sections"]])


# ---------------------------------------------------------------------------
# 变体 2：富文本模块（专业技能）很长，需要用「有序列表 + 无序列表」验证跨页拆分
#   · 有序列表拆开后序号必须继续（ol start）
# ---------------------------------------------------------------------------
d2 = json.load(open(SRC, encoding="utf-8"))
r2 = d2["xl-resume-data"]["state"]["resumes"][0]
r2["name"] = "长技能清单-分页测试"

long_ul = "<ul>" + "".join(
    f"<li>技能项 {i}：熟悉 XXX 工具链与 YYY 方法，具备 ZZZ 方向的独立交付经验，能独立完成从调研到落地。</li>"
    for i in range(1, 26)
) + "</ul>"
long_ol = "<ol>" + "".join(
    f"<li>工作流步骤 {i}：先完成 XXX 处理，再执行 YYY 校验，最后输出 ZZZ 结果并归档。</li>"
    for i in range(1, 19)
) + "</ol>"

for s in r2["sections"]:
    t = s["type"]
    if t == "skills":
        s["content"] = "<p>以下为完整技能清单与工作流说明：</p>" + long_ul + long_ol
    elif t == "education":
        s["items"] = s["items"][:1]
    elif t == "selfEval":
        s["content"] = "<p>具备扎实的工程基础与快速学习能力，能在快节奏团队中稳定交付结果。</p>"
    elif s["kind"] == "list":
        s["items"] = []
    else:
        s["content"] = ""

d2["xl-resume-data"]["state"]["resumes"][0] = r2
json.dump(d2, open("tools/seeds/seed-long-rich.json", "w", encoding="utf-8"), ensure_ascii=False)
print("已写入", os.path.abspath("tools/seed-long-rich.json"))
