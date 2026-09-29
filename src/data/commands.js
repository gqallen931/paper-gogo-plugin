/**
 * Paper-gogo slash-command catalog.
 * Source of truth: `references/command-system.md` (plus the artifact/execution
 * commands added by `references/phase-skill-routing.md`).
 */

/** Command groups, in the order the command system presents them. */
export const COMMAND_GROUPS = [
  { id: 'intake', label: '建档与诊断' },
  { id: 'novelty', label: '问题与创新' },
  { id: 'evidence', label: '证据与实验' },
  { id: 'section', label: '章节修改' },
  { id: 'submission', label: '审稿与投稿' },
  { id: 'artifact', label: '产物与执行' },
]

/**
 * Every command. `run` is the executable intent, not prose, so the model can
 * follow it without re-deriving the workflow.
 */
export const COMMANDS = [
  // --- intake -------------------------------------------------------------
  {
    cmd: '/建立档案',
    group: 'intake',
    purpose: '提取领域、目标期刊、研究问题、方法、数据、实验、结论、贡献与主要风险',
    run: '提取研究领域、目标期刊、研究问题、核心方法、数据、实验、结论、声称的贡献与主要风险；不重写论文。产出项目档案。',
  },
  {
    cmd: '/审稿人诊断',
    group: 'intake',
    purpose: '模拟三视角审稿，输出作者意见、编辑保密意见与建议决定',
    run: '模拟三个视角：A 创新性与科学重要性；B 方法、实验、统计与可复现性；C 论证、写作、图表与期刊匹配。返回公开作者意见、必要的编辑保密关切，以及 Reject/Major/Minor/Accept 建议。不得虚构学术不端；只描述可观察的警示信号与所需核实。',
  },
  {
    cmd: '/评分',
    group: 'intake',
    purpose: '应用 100 分量表并解释扣分项',
    run: '应用 SKILL.md 的 100 分量表：创新 30 / 证据充分性 30 / 科学实践重要性 20 / 写作呈现 10 / 期刊匹配 10。解释扣分，列出 5 项最高价值修复。不得换算为录用概率。',
  },
  {
    cmd: '/目标期刊',
    group: 'intake',
    purpose: '评估期刊范围、文章类型、贡献门槛与呈现要求',
    run: '使用已提供或已核验的期刊指南，评估范围、文章类型、预期贡献、证据深度与呈现要求。若现行指南未提供，标记 VERIFY。',
  },

  // --- problem & novelty --------------------------------------------------
  {
    cmd: '/提炼问题',
    group: 'novelty',
    purpose: '用“现象 → 机制 → 条件”产出一个主问题与两个备选',
    run: '用“现象 -> 机制 -> 条件”产出一个主研究问题与两个备选问题；区分科学问题与工程任务。',
  },
  {
    cmd: '/检查创新',
    group: 'novelty',
    purpose: '分类贡献并标记无支撑措辞',
    run: '将每条声称的贡献分类为：领域/科学创新、方法或工程改进、通用技术应用、仅呈现性贡献。把可行贡献改写为“已有失败 -> 缺失的领域洞见 -> 提出设计 -> 已验证收益”。标记“first”“novel”“SOTA”“robust”等无支撑措辞。',
  },
  {
    cmd: '/领域偏置',
    group: 'novelty',
    purpose: '把领域结构映射到归纳偏置与判别实验',
    run: '识别领域特有的结构、物理、因果关系、时序周期、拓扑、约束或操作规则，将每一项映射到可能的归纳偏置与一个判别实验。拒绝把通用注意力、残差连接、位置编码或模型替换当作独立的跨领域创新。',
  },

  // --- evidence & experiments --------------------------------------------
  {
    cmd: '/修改实验',
    group: 'evidence',
    purpose: '审计数据划分、泄漏、baseline、公平性与可复现性',
    run: '审计数据划分、泄漏、baseline、公平性、超参、可复现性、重复运行、不确定性、鲁棒性、效率、泛化与失败分析；把已支撑的结论与仍缺证据的结论分开。',
  },
  {
    cmd: '/设计消融',
    group: 'evidence',
    purpose: '为每个核心主张指定消融与判别性',
    run: '为每个核心主张指定消融、控制变量、预期观察，以及每种可能结果如何改变该主张；优先选择最小的高判别性实验集合。',
  },
  {
    cmd: '/分析难例',
    group: 'evidence',
    purpose: '建立错误分类并检测多模型共性失败',
    run: '建立领域适配的错误分类；检验多个代表性模型是否在同一条件下反复失败；推荐基于场景、设备、批次或时间的划分以防止泄漏。',
  },
  {
    cmd: '/证据审计',
    group: 'evidence',
    purpose: '生成主张—证据表并标注四态证据标签',
    run: '生成表格，列为：主张、正文位置、支撑图表/实验、证据状态（SUPPORTED/INFERRED/VERIFY/MISSING）、替代解释、缺失测试、允许的措辞。',
  },
  {
    cmd: '/检查公式',
    group: 'evidence',
    purpose: '检查定义、量纲、索引、符号一致性与推导完整性',
    run: '检查定义、量纲、索引、编号、符号一致性、假设与推导完整性；数学有效性不确定时标记为待核实，不得假装确定。',
  },

  // --- section revision ---------------------------------------------------
  {
    cmd: '/修改标题',
    group: 'section',
    purpose: '提供 5 个有边界标题并推荐 1 个',
    run: '提供 5 个有边界的标题，分别强调科学问题、方法、领域机制、应用，以及一个简洁保守选项；推荐其中一个。',
  },
  {
    cmd: '/修改摘要',
    group: 'section',
    purpose: '按背景→难点→方法→结果→边界重写摘要',
    run: '按“背景/问题 -> 未解难点 -> 方法与领域依据 -> 定量结果 -> 有边界贡献”组织。缺失证据处插入【请补充】，不得编造。',
  },
  {
    cmd: '/修改引言',
    group: 'section',
    purpose: '按谜题→重要性→现有解释→冲突→视角→贡献重写引言',
    run: '按“谜题或现实矛盾 -> 重要性 -> 现有解释 -> 未解冲突 -> 提出视角 -> 贡献”组织。避免只讲 gap 的开头与泛泛的“此前工作有限”式论断。',
  },
  {
    cmd: '/修改相关工作',
    group: 'section',
    purpose: '把文献组织成对话而非清单',
    run: '按“主流解释 -> 局限 -> 替代观点 -> 冲突/互补 -> 本文位置”组织文献对话；保留引用标识。',
  },
  {
    cmd: '/修改方法',
    group: 'section',
    purpose: '为每个模块说明问题、理由、领域依据与验证实验',
    run: '为每个模块说明：问题、理由、领域依据、实现、与其他模块的关系、预期效果、验证实验。标记模块堆砌。',
  },
  {
    cmd: '/修改结果',
    group: 'section',
    purpose: '按观察→假设关系→解释→适用条件→异常组织',
    run: '按“观察结果 -> 与假设的关系 -> 支撑解释 -> 适用条件 -> 异常与失败”撰写；不得只是重复表格。',
  },
  {
    cmd: '/修改讨论',
    group: 'section',
    purpose: '讨论机制、与既有工作关系、启示、范围与替代解释',
    run: '处理机制、与既有工作的关系、启示、范围、失败条件、替代解释，以及无支撑的外推。',
  },
  {
    cmd: '/修改局限',
    group: 'section',
    purpose: '陈述具体局限、对结论的影响与可行验证路径',
    run: '陈述具体的局限、其对当前结论的影响，以及一条可行的验证路径。避免空洞的未来工作措辞。',
  },
  {
    cmd: '/修改结论',
    group: 'section',
    purpose: '只总结有支撑的发现',
    run: '只总结有支撑的发现；不引入新结果、不夸大影响。',
  },
  {
    cmd: '/逐段修改',
    group: 'section',
    purpose: '返回原问题、替换段落、关键改动与缺失作者信息',
    run: '返回：原段落问题、替换段落、关键改动说明、缺失的作者信息。',
  },
  {
    cmd: '/学术润色',
    group: 'section',
    purpose: '提升准确性、简洁性、连贯性与学科语域',
    run: '提升准确性、简洁性、连贯性与学科适配的文风，不改变技术含义，不为规避 AI 检测器优化。',
  },
  {
    cmd: '/压缩',
    group: 'section',
    purpose: '压缩篇幅并报告实质删减',
    run: '保留术语、数字、公式、引用与逻辑强度；报告压缩过程中造成的实质删减。',
  },
  {
    cmd: '/中译英',
    group: 'section',
    purpose: '中文译英，保留术语与逻辑强度',
    run: '保留术语、数字、公式、引用与逻辑强度。',
  },
  {
    cmd: '/英译中',
    group: 'section',
    purpose: '英文译中，保留术语与逻辑强度',
    run: '保留术语、数字、公式、引用与逻辑强度。',
  },

  // --- review & submission -----------------------------------------------
  {
    cmd: '/模拟拒稿',
    group: 'submission',
    purpose: '列出最多 10 条可能拒稿理由并分级',
    run: '列出最多 10 条可能拒稿理由，分为致命、主要、次要三级；标明哪些可用润色修复、哪些必须补证据。',
  },
  {
    cmd: '/投稿前检查',
    group: 'submission',
    purpose: '检查投稿包各组件的一致性',
    run: '检查标题、摘要、Highlights、图文摘要、贡献、方法、结果、图表、补充材料、引用、声明与结论之间的一致性。',
  },
  {
    cmd: '/回复审稿人',
    group: 'submission',
    purpose: '按“感谢→理解→行动→证据→位置”逐点回复',
    run: '对每条意见使用“感谢 -> 理解 -> 行动 -> 证据 -> 精确位置”。如果某项要求的实验未执行，如实说明并提供有边界的替代分析或解释。',
  },

  // --- artifacts & execution ---------------------------------------------
  {
    cmd: '/生成汇报PPT',
    group: 'artifact',
    purpose: '生成真实 PPTX 而非大纲',
    run: '调用 nature-paper2ppt。在论文或已溯源的阅读笔记可用后执行。工具可用时必须产出真实 PPTX，而不是只有大纲。',
  },
  {
    cmd: '/补充引用',
    group: 'artifact',
    purpose: '分段主张、分级支撑、核验元数据并导出',
    run: '调用 nature-citation：分段主张、保守分级支撑程度、核验元数据，并导出所请求的文献管理格式。',
  },
  {
    cmd: '/数据可用性',
    group: 'artifact',
    purpose: '盘点数据集、选择获取路径、起草声明',
    run: '调用 nature-data：盘点数据集、选择获取路径、起草声明，并标记缺失的仓库标识符。',
  },
  {
    cmd: '/生成结果图',
    group: 'artifact',
    purpose: '生成出版级结果图（须先选定 Python 或 R）',
    run: '调用 nature-figure。若用户未选定 Python 或 R，只问这一个问题并停止；选定后只用该后端进行绘制、预览、导出与视觉 QA。',
  },
  {
    cmd: '/生成图文摘要',
    group: 'artifact',
    purpose: '生成最多 1 份图文摘要',
    run: '当目标期刊要求或允许时，生成最多一份论文级 Graphical Abstract，基于已核验的问题、方法、主要发现与边界。不得把每张正文图说明当作图文摘要，不得编造无支撑效果。',
  },
  {
    cmd: '/生成框架图',
    group: 'artifact',
    purpose: '只执行明确请求的那一个 S 步骤',
    run: '调用 paper-framework-figure-studio-pro。只执行显式请求的 S0-S7 步骤，绝不自动推进。Phase 5/9 使用 framework-concept 状态，Phase 13 使用独立的 framework-final 状态。',
  },
  {
    cmd: '/代码实现',
    group: 'artifact',
    purpose: '按工程架构实现代码',
    run: '调用 codebase-design，然后按实现任务条件性调用 tdd、python-expert 与 karpathy-guidelines。',
  },
  {
    cmd: '/诊断实验错误',
    group: 'artifact',
    purpose: '先构建可变红反馈循环再形成根因假设',
    run: '调用 diagnosing-bugs；在形成根因理论之前，先构建一个可变红的反馈循环。',
  },
]

/** Fast lookup by exact command string. */
export const COMMAND_BY_CMD = new Map(COMMANDS.map((c) => [c.cmd, c]))

/** Every command string, for schema enum projection. */
export const COMMAND_NAMES = COMMANDS.map((c) => c.cmd)

/** The fixed five-part output contract for revision commands. */
export const OUTPUT_CONTRACT = ['诊断', '修改稿', '修改依据', '证据边界', '下一步']

/**
 * Keywords per command, used by the router's scoring. Deliberately bilingual
 * because the workflow is bilingual in practice.
 */
export const COMMAND_KEYWORDS = {
  '/建立档案': ['建档', '项目档案', 'profile', 'intake', '材料清单', '我现在有什么'],
  '/审稿人诊断': ['审稿', 'reviewer', '三视角', '诊断', '模拟审稿', 'reject', '拒稿意见'],
  '/评分': ['评分', '打分', 'score', '100分', 'rubric', '多少分'],
  '/目标期刊': ['目标期刊', '选刊', 'venue', 'journal', '投稿期刊', '期刊匹配'],
  '/提炼问题': ['提炼问题', '研究问题', 'research question', '现象机制条件', '问题定义'],
  '/检查创新': ['创新', 'novelty', '创新点', 'contribution', '贡献', 'first', 'sota'],
  '/领域偏置': ['领域偏置', 'inductive bias', '归纳偏置', '领域机制', 'domain bias'],
  '/修改实验': ['修改实验', '实验审计', '数据泄漏', 'leakage', 'baseline', '可复现', '公平性'],
  '/设计消融': ['消融', 'ablation', '控制变量', '对照实验'],
  '/分析难例': ['难例', '错误分析', 'failure case', 'error taxonomy', 'hard example'],
  '/证据审计': ['证据审计', 'evidence audit', '主张证据', '证据状态', 'supported', 'unsupported'],
  '/检查公式': ['公式', '符号', '推导', '量纲', 'equation', 'notation'],
  '/修改标题': ['标题', 'title', '题目'],
  '/修改摘要': ['摘要', 'abstract'],
  '/修改引言': ['引言', 'introduction', '背景'],
  '/修改相关工作': ['相关工作', 'related work', '文献综述章节'],
  '/修改方法': ['方法章节', 'method section', '模块说明'],
  '/修改结果': ['结果章节', 'results section', '实验结果写作'],
  '/修改讨论': ['讨论', 'discussion'],
  '/修改局限': ['局限', 'limitation', '局限性'],
  '/修改结论': ['结论', 'conclusion'],
  '/逐段修改': ['逐段', '段落修改', 'paragraph', '逐段润色'],
  '/学术润色': ['润色', 'polish', '语言', 'wording'],
  '/压缩': ['压缩', '缩短', 'shorten', 'compress', '减字数'],
  '/中译英': ['中译英', '翻译成英文', 'translate to english'],
  '/英译中': ['英译中', '翻译成中文', 'translate to chinese'],
  '/模拟拒稿': ['模拟拒稿', 'desk reject', '桌拒', '拒稿原因'],
  '/投稿前检查': ['投稿前检查', 'pre-submission', '投稿检查', 'submission check'],
  '/回复审稿人': ['回复审稿人', 'response to reviewer', 'rebuttal', '审稿意见回复', '返修'],
  '/生成汇报PPT': ['ppt', '汇报', 'slides', '演示文稿'],
  '/补充引用': ['补充引用', '加引用', 'citation', '参考文献导出', 'bibtex'],
  '/数据可用性': ['数据可用性', 'data availability', '数据声明', '仓库标识符'],
  '/生成结果图': ['结果图', 'figure', '作图', '绘图', '图表生成'],
  '/生成图文摘要': ['图文摘要', 'graphical abstract', 'GA'],
  '/生成框架图': ['框架图', 'framework figure', '模块图', '架构图'],
  '/代码实现': ['代码实现', '写代码', 'implement', 'coding', '工程实现'],
  '/诊断实验错误': ['诊断错误', '调试', 'debug', '报错', '实验失败'],
}
