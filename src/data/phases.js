/**
 * Paper-gogo v6 workflow data model.
 *
 * Sources of truth, in the precedence order the workflow itself declares
 * (`SKILL.md` boundaries > `paper-workflow-v6.md` gates > `phase-skill-routing.md`
 * > inherited v5 wording):
 *
 *   - phase names / goals / deliverables: `paper-workflow-v6.md` Phase 详细设计
 *   - primary + auxiliary skills:         `references/phase-skill-routing.md`
 *   - gates G0-G6:                        `SKILL.md` (canonical) / `README.md`
 *   - evidence states:                    `SKILL.md` Boundaries
 *
 * Where the v6 document contradicts the routing file, the routing file wins,
 * because it is the declared authoritative execution routing contract.
 */

/** The four workflow stages. Phase ranges are inclusive. */
export const STAGES = [
  { id: 'prepare', label: '准备阶段', phases: [0, 5], summary: '立项、问题准入、文献与创新审查、实验方案设计' },
  { id: 'implement', label: '实现阶段', phases: [6, 8], summary: '代码构建、实验执行、结果审查与复现验证' },
  { id: 'write', label: '写作阶段', phases: [9, 10], summary: '结果图与唯一图文摘要、作者主张驱动撰写' },
  { id: 'submit', label: '投稿阶段', phases: [11, 17], summary: '内容审查、润色、终稿框架图、整合、语言、期刊匹配、审稿回复' },
]

/**
 * The seven quality gates. `question` is the reviewer-facing question; `result`
 * is the required artifact. Gate vocabulary is PASS / PASS WITH CONDITIONS / FAIL.
 */
export const GATES = [
  { id: 'G0', name: 'Scope', question: '是否在期刊范围内且合乎伦理可审？', result: '项目档案与目标期刊匹配度', zh: '期刊范围、材料和伦理准入' },
  { id: 'G1', name: 'Problem', question: '问题是否重要且非平凡？', result: '“现象—机制—条件”三层问题表述', zh: '研究问题重要且可回答' },
  { id: 'G2', name: 'Novelty', question: '创新是否领域驱动且有文献支撑？', result: '主张地图与创新性判定', zh: '创新由领域机制和文献支持' },
  { id: 'G3', name: 'Design', question: '研究设计能否检验核心主张？', result: '主张—实验矩阵', zh: '研究设计能检验核心主张' },
  { id: 'G4', name: 'Evidence', question: '结果是否支撑每一条主要主张？', result: '证据审计与失败分析', zh: '实验证据支撑结论' },
  { id: 'G5', name: 'Manuscript', question: '论证是否自洽且可复现？', result: '审稿人审计与修订台账', zh: '全文论证一致且可复现' },
  { id: 'G6', name: 'Submission', question: '期刊匹配、文件、引用与披露是否就绪？', result: '投稿检查清单', zh: '投稿文件、引用和披露完整' },
]

/** Gate outcome vocabulary. A FAIL must produce a repair plan; prose cannot override it. */
export const GATE_RESULTS = ['PASS', 'PASS WITH CONDITIONS', 'FAIL']

/**
 * Gate IDs that block advancement when they fail. Every gate is blocking: the
 * workflow states that gates touching academic truth, data integrity, evidence
 * sufficiency and submission compliance may not be skipped.
 */
export const BLOCKING_GATES = GATES.map((g) => g.id)

/** Four-state evidence vocabulary used to label every substantive claim. */
export const EVIDENCE_STATES = [
  { id: 'SUPPORTED', meaning: '由已提供的证据支持', wording: '可作确定性陈述' },
  { id: 'INFERRED', meaning: '合理解释，但需显式标注', wording: '必须写明为推断' },
  { id: 'VERIFY', meaning: '需作者或来源核实', wording: '不得当作已确认事实' },
  { id: 'MISSING', meaning: '所需证据缺失', wording: '必须停止相应结论' },
]

/** Execution markers that prevent “pretending it ran”. */
export const EXECUTION_MARKERS = [
  { id: 'NON_EVALUABLE', trigger: 'Stub、模拟数据或未完成运行', effect: '不得进入主表、排名、统计检验或论文主张' },
  { id: 'SKILL_UNAVAILABLE', trigger: '主技能不可用', effect: '执行有边界的人工回退，不得假装技能已运行' },
  { id: 'AUTHOR_INPUT_NEEDED', trigger: '输入不足', effect: '生成占位字段，不得猜测' },
  { id: 'LOCK', trigger: '术语锁定项', effect: '润色前锁死；Phase 14 要求 23 项 LOCK 术语—公式—代码三方对齐' },
]

/** Instruction precedence, highest first. */
export const PRECEDENCE = [
  'SKILL.md 真实性边界与安全规则',
  'paper-workflow-v6.md 增强规则与质量门禁',
  'references/phase-skill-routing.md 执行路由',
  '各 Phase 继承自 v5 的流程描述',
]

/** The seven bundled skill groups. */
export const SKILL_GROUPS = [
  { id: 'nature-skills', label: '论文', count: 9, use: '检索、阅读、写作、润色、引用、数据、图表、PPT、审稿回复' },
  { id: 'code-understanding', label: '代码理解', count: 9, use: '条件式代码理解、差异分析、故障诊断' },
  { id: 'architecture-engineering', label: '工程', count: 8, use: '领域建模、模块设计、TDD' },
  { id: 'world-model-method', label: '决策', count: 1, use: '复杂方案比较、决策与审查' },
  { id: 'paper-framework-figure-studio-pro', label: '框架图', count: 1, use: '严格逐回合 S0-S7 论文框架图' },
  { id: 'karpathy-guidelines', label: '编码护栏', count: 1, use: '简洁、可验证、最小范围的代码修改' },
  { id: 'python-expert', label: 'Python', count: 1, use: '模型、训练、评估与实验实现' },
]

/**
 * All 18 phases.
 *
 * `gate` states the phase-specific entry/completion constraint in the doc's own
 * terms. `fallback` states the bounded fallback. `aux` lists conditional
 * auxiliary skills with their trigger.
 */
export const PHASES = [
  {
    n: 0,
    stage: 'prepare',
    name: '项目检查',
    goal: '搞清楚“我现在有什么”',
    outputs: ['docs/项目工作阶段记录/Phase0_项目检查.md'],
    primary: 'world-model-method',
    aux: [{ skill: 'understand', trigger: '存在大型代码项目且其 plugin/Node/agent 预检通过' }],
    gate: 'v6 块要求记录目标、约束、材料清单、调用技能与缺失输入；无独立门禁',
    fallback: 'understand 预检不通过 → 范围受限的目录/入口/依赖直接清点，记录“项目为零起点”',
    record: '目标、约束、材料清单、调用技能、缺失输入',
  },
  {
    n: 1,
    stage: 'prepare',
    name: '必需要素采集',
    goal: '确认用户知道自己要做什么',
    outputs: ['docs/项目工作阶段记录/Phase1_要素采集.md'],
    primary: 'domain-modeling',
    aux: [{ skill: 'grilling', trigger: '术语、问题边界或假设仍含糊且用户接受访谈模式' }],
    gate: '研究问题必须完成“现象—机制—条件”三层表达；研究方向与研究问题为硬性必须；用户说不清楚时帮理清思路，不能跳过',
    fallback: '未在文档中定义',
    record: '术语表、“现象—机制—条件”问题、边界决策',
  },
  {
    n: 2,
    stage: 'prepare',
    name: '文献检索与入库',
    goal: '建立与研究问题匹配、可追溯的分层文献库；数量由领域成熟度与论文类型决定，不以固定篇数替代覆盖度',
    outputs: ['docs/参考文献/*.md', 'docs/参考文献/文献分层表.md', 'docs/{Project}_BibTeX.bib'],
    primary: 'nature-academic-search',
    aux: [
      { skill: 'nature-reader', trigger: '需要解析或转换用户提供的论文' },
      { skill: 'nature-citation', trigger: '需要核验支撑等级或导出 ENW/RIS/RDF' },
    ],
    gate: '所有“首次/领先/尚未解决”表述必须进入 VERIFY 清单；核心集通常 8–15 篇，偏离须记录理由；PDF→Markdown 为硬性要求',
    fallback: '未在文档中定义',
    record: '检索日志、分层去重文献库、已核验元数据',
  },
  {
    n: 3,
    stage: 'prepare',
    name: '全文阅读与综述生成',
    goal: '审稿式阅读核心文献并综合扩展文献，形成可核验的证据地图和综述草稿',
    outputs: ['docs/综述/学术综述.md'],
    primary: 'nature-reader',
    aux: [
      { skill: 'nature-writing', trigger: '需要综合成文' },
      { skill: 'nature-paper2ppt', trigger: '用户显式要求生成 PPTX' },
    ],
    gate: '核心集逐篇全文深读；扩展集命中直接相关、冲突证据或关键方法时必须升级为核心集；所有结论保留来源锚点，不得把摘要级信息伪装成全文结论',
    fallback: '扩展集 → 核心集升级规则',
    record: '来源锚点、证据地图、综述草稿；核心问题、贡献、关键假设、证据链、弱点、必读与可略读部分',
  },
  {
    n: 4,
    stage: 'prepare',
    name: '创新点识别与审查',
    goal: '基于综述 gap 识别真正的创新点并严格审查',
    outputs: ['docs/创新点表.md', 'docs/创新点/审查报告.md'],
    primary: 'world-model-method',
    aux: [
      { skill: 'domain-modeling', trigger: '需要领域约束建模' },
      { skill: 'nature-writing', trigger: '需要主张—证据自审' },
    ],
    gate: '四标准审查（模块堆砌 / 真实创新性 / 期刊贡献门槛 / 实验可实现性）不达标即退回或降级主张；通用注意力、残差连接、位置编码或模型替换不得单独计为交叉创新',
    fallback: '用户确认循环：不满意 → 修改 → 重审，直到满意',
    record: '创新分类、领域偏置地图、候选路径比较',
  },
  {
    n: 5,
    stage: 'prepare',
    name: '方案设计 + 框架图 S0-S3',
    goal: '把创新点落地为可执行的实验方案',
    outputs: ['docs/journal_profile.md', 'docs/baseline_清单.md', 'docs/实验协议.md', 'docs/RQ.md'],
    primary: 'world-model-method',
    aux: [
      { skill: 'domain-modeling', trigger: '需要领域约束建模' },
      { skill: 'paper-framework-figure-studio-pro', trigger: '用户显式请求 S0-S3 中的某一步' },
    ],
    gate: '框架图 S0-S3 每个用户回合最多执行一步，禁止自动推进；项目 ID 为 framework-concept',
    fallback: '未在文档中定义',
    record: '研究设计、主张—实验矩阵、已确认的框架图方向',
  },
  {
    n: 6,
    stage: 'implement',
    name: '项目代码构建',
    goal: '按真实工程架构构建项目代码；工程架构优先，有参考项目则参考，模块化、可测试、可配置',
    outputs: ['完整项目代码', 'smoke test PASS（forward + backward）'],
    primary: 'codebase-design',
    aux: [
      { skill: 'tdd', trigger: '存在行为变更' },
      { skill: 'python-expert', trigger: '涉及 Python 实现' },
      { skill: 'karpathy-guidelines', trigger: '始终作为编码护栏' },
      { skill: 'understand', trigger: '依赖预检通过后' },
    ],
    gate: 'smoke test 必须 PASS；Baseline 缺失依赖时只允许接口 stub 且必须标记 NON_EVALUABLE，不得进入实验结果或排名；git init 仅在用户明确同意时执行',
    fallback: '依赖预检不通过 → 不调用 understand，改为范围受限的直接代码检查',
    record: '实现计划、已测试模块、可复现配置',
  },
  {
    n: 7,
    stage: 'implement',
    name: '实验执行',
    goal: '整个工作流中耗时最长、最关键的阶段（文档未单列目标行）',
    outputs: ['results/phase7_full.json', 'results/tables/*.tex', 'results/phase7_figure_data.json', 'logs/'],
    primary: 'python-expert',
    aux: [
      { skill: 'diagnosing-bugs', trigger: '运行失败、回归、挂起或变得非确定性' },
      { skill: 'tdd', trigger: '需要锁定复现性失败' },
      { skill: 'karpathy-guidelines', trigger: '始终作为编码护栏' },
    ],
    gate: '失败诊断必须先建立可变红的反馈循环，再形成根因假设；真实性门禁：stub、模拟数据和未完成运行必须标记 NON_EVALUABLE，不得进入主表、排名、统计检验或论文主张',
    fallback: '回溯决策：小修原地 / 架构问题回 Phase 6 / 方法问题回 Phase 4',
    record: '可执行实验、日志、结构化结果、回归检查',
    detail: {
      subphases: [
        ['7A', '实验设置', 'P0'],
        ['7B', '主实验结果', 'P0'],
        ['7C', '消融与机制验证', 'P0（存在可分解设计或机制主张时）'],
        ['7D', '超参敏感度', 'P1'],
        ['7E', '鲁棒性分析', '主张含鲁棒性时 P0，否则 P1'],
        ['7F', '泛化实验', '主张含泛化时 P0，否则 P1（跨数据集 / 跨场景 / 少样本迁移 10%-25%-50% / 跨时间·跨传感器）'],
        ['7G', '效率分析', 'P1'],
        ['7H', '定性分析', 'P1'],
        ['7I', '汇总出表', 'P0'],
      ],
      cache: 'cache/ 以数据/配置/split 哈希为失效判据；SHA 不匹配或 --clear-cache → 清除重建',
    },
  },
  {
    n: 8,
    stage: 'implement',
    name: '结果审查与复现验证',
    goal: '在写论文前确认结果站得住；本阶段只审计，发现证据缺口时回退 Phase 7 补实验并重新审计',
    outputs: ['results/复现_checklist.md', 'results/审查报告.md'],
    primary: 'world-model-method',
    aux: [
      { skill: 'understand-diff', trigger: '代码发生了变更' },
      { skill: 'tdd', trigger: '需要锁定复现性失败' },
    ],
    gate: '结果完整性检查 FAIL 时自动生成回退清单并映射到 Phase 7 子阶段；代码扫描含 8 项 checklist（死代码、数据泄漏、配置一致性、硬编码路径、种子固定、训练测试分离、标签泄漏、数据增强一致性）；公平性审查每项 WARN/FAIL 附具体建议；用户三选一：接受 / 回退修复 / 标注理由跳过',
    fallback: '缺失项回退 Phase 7 补实验后重新审计',
    record: '主张—证据矩阵、泄漏风险、基线公平性、替代解释、允许的结论措辞',
  },
  {
    n: 9,
    stage: 'write',
    name: '可视化与 Graphical Abstract',
    goal: '生成出版级图表与唯一图文摘要（文档未单列目标行）',
    outputs: ['docs/figure/fig{N}/*.{pdf,svg,png}', 'docs/figure/fig{N}/fig{N}_brief.md', '可选 docs/投稿/graphical_abstract.{pdf,svg,png}'],
    primary: 'nature-figure',
    aux: [{ skill: 'paper-framework-figure-studio-pro', trigger: '继续 framework-concept 的 S4-S7' }],
    gate: '图的数量服从论证需要；所有实际使用的图通过数据一致性、可读性、caption 与正文交叉引用检查；若生成概念框架图则其 S7 必须 PASS；nature-figure 未指定 Python 或 R 时必须先询问并停止；一篇论文最多一份 Graphical Abstract',
    fallback: '未在文档中定义（S7 必须 PASS 为硬条件）',
    record: '出版级图表、每图 figure brief、概念框架图候选、可选唯一图文摘要',
  },
  {
    n: 10,
    stage: 'write',
    name: '论文撰写',
    goal: '作者主张驱动的撰写（文档未单列目标行）',
    outputs: ['docs/论文/{Project}_Paper_v1.tex', 'docs/论文/numbering_register.md', 'docs/论文/论证结构库.md'],
    primary: 'nature-writing',
    aux: [
      { skill: 'nature-reader', trigger: '需要回到来源论文核实' },
      { skill: 'nature-citation', trigger: '论断需要文献支撑' },
      { skill: 'domain-modeling', trigger: '需要锁定术语' },
    ],
    gate: '作者提供或确认核心主张、证据、边界与关键判断；数字只从通过 Phase 8 审计的结果注入，正文图描述只从对应 figure brief/caption 生成；禁止复制或近似改写他人有辨识度的句子',
    fallback: '未在文档中定义',
    record: '完整初稿、主张—证据表、编号注册表、假设与缺失输入、允许的措辞强度',
  },
  {
    n: 11,
    stage: 'submit',
    name: '内容审查 + 引用校验',
    goal: '三视角内容审查与术语锁定（文档未单列目标行）',
    outputs: ['docs/论文/内容审查报告.md', 'docs/论文/术语表.md'],
    primary: 'nature-writing',
    aux: [
      { skill: 'world-model-method', trigger: '需要整体一致性自审' },
      { skill: 'nature-citation', trigger: '需要核验引用支撑' },
      { skill: 'nature-data', trigger: '涉及数据可用性' },
    ],
    gate: '润色前必须锁死 LOCK 项；过度宣称检测（SOTA / first / robust 是否有数据支撑）；参考文献数量不设统一下限，但须覆盖领域核心工作、直接证据与关键反例',
    fallback: '未在文档中定义',
    record: '审稿报告、术语表、风险清单',
  },
  {
    n: 12,
    stage: 'submit',
    name: '引用插入 + 终稿润色',
    goal: '引用可信的结构化润色（文档未单列目标行）',
    outputs: ['docs/论文/{Project}_Paper_final.tex', 'docs/参考文献/refs.bib（按 [1]~[N] 排序）'],
    primary: 'nature-polishing',
    aux: [
      { skill: 'nature-writing', trigger: '结构仍有问题' },
      { skill: 'nature-citation', trigger: '需要新增或调整引用' },
      { skill: 'nature-data', trigger: '涉及数据声明' },
    ],
    gate: '润色升级顺序固定为：论文类型 → 章节任务 → 段落逻辑 → 主张/证据/边界 → 句子语言；逻辑未通过时禁止只做表面语言美化；引用匹配不使用跨学科通用的“SCI>会议>arXiv”机械排序；按行文逻辑 [1] 起顺序编号，同篇复用同号',
    fallback: '结构仍破损时先回 nature-writing',
    record: '引用可信的修订稿、修改依据、证据边界、引用核验状态、修改台账',
  },
  {
    n: 13,
    stage: 'submit',
    name: '框架图 + 模块图绘制',
    goal: '基于最终定稿的独立框架图项目（文档未单列目标行）',
    outputs: ['docs/figure/fig_framework_final.{pdf,svg,png}', 'docs/figure/fig_module_{1-N}_*.{pdf,svg,png}'],
    primary: 'paper-framework-figure-studio-pro',
    aux: [{ skill: 'nature-figure', trigger: '需要定量子图' }],
    gate: '必须新建独立 framework-final 状态并从最终定稿重新执行 S0，不得复用或静默覆盖 Phase 5/9 的 framework-concept；每回合最多一个 S 步骤；S7 必须联合审查图、caption、legend 与正文引用句后才算完成',
    fallback: '未在 v6 层定义（子技能层有 S7 verdict 回滚规则）',
    record: '最终框架图包与联合语义审计',
  },
  {
    n: 14,
    stage: 'submit',
    name: '全文整合 + 终稿审查',
    goal: '整合所有正文图表与独立投稿资产，完成 10 项全面审查',
    outputs: ['docs/论文/{Project}_Paper_FINAL.tex/.pdf', 'docs/投稿/submission_package/'],
    primary: 'world-model-method',
    aux: [
      { skill: 'nature-writing', trigger: '需要整体一致性自审' },
      { skill: 'nature-citation', trigger: '需要引用核验' },
      { skill: 'nature-data', trigger: '涉及数据声明' },
    ],
    gate: '标题、摘要、Highlights、图表、正文、补充材料和结论中的每个强主张必须一致；23 项 LOCK 术语—公式—代码三方对齐；每个定量数字对照 Phase 7 JSON',
    fallback: '未在文档中定义',
    record: '一致性审查通过、投稿包',
    detail: {
      checks: [
        '图表最终整合（正文只嵌入论文图表；唯一 GA 作独立投稿资产）',
        '全文完整性',
        '图表正确性（编号 / 标题 / caption / 交叉引用）',
        '参考文献正确性（存在？编号一致？条目完整？）',
        '参考文献顺序（[1]→[N] 首次出现顺序，同篇复用同号）',
        '数据—正文一致性（每个定量数字对照 Phase 7 JSON）',
        '术语—公式—代码一致性（23 LOCK 项三方对齐）',
        '排版格式（期刊模板 / 页数 / 图表分辨率 / 字体 / 行距）',
        '投稿包生成',
        '最终审查报告 + 用户确认',
      ],
    },
  },
  {
    n: 15,
    stage: 'submit',
    name: '语言质量与作者声音',
    goal: '准确、简洁、连贯、专业并保留作者声音；本阶段不提供“去 AI 率”或规避检测器服务',
    outputs: ['docs/论文/{Project}_Paper_FINAL_v3.tex/.pdf', 'docs/论文/语言质量报告.md'],
    primary: 'nature-polishing',
    aux: [
      { skill: 'nature-writing', trigger: '章节逻辑破损' },
      { skill: 'domain-modeling', trigger: '术语漂移' },
    ],
    gate: '五维检查：准确 / 简洁 / 连贯 / 专业 / 作者声音；任何改写后必须重新核对数据、术语、引用、图表与因果强度；不得为了“像人写”而随机改句',
    fallback: '章节逻辑破损 → nature-writing；术语漂移 → domain-modeling',
    record: '语言终稿、一致性复核、语言质量报告',
  },
  {
    n: 16,
    stage: 'submit',
    name: '期刊匹配 + 审稿模拟',
    goal: '定性投稿风险与决策建议（文档未单列目标行）',
    outputs: ['docs/投稿/期刊匹配报告.md', 'docs/投稿/模拟审稿意见.md', 'docs/投稿/投稿风险评估.md'],
    primary: 'world-model-method',
    aux: [
      { skill: 'nature-writing', trigger: '需要比较目标 venue 文献' },
      { skill: 'nature-academic-search', trigger: '需要检索现行期刊政策' },
    ],
    gate: '8 维 editorial 视角；3 位不同类型审稿人（方法专家 / 应用专家 / 理论专家）；输出定性桌拒风险与 Reject/Major/Minor/Accept 模拟判断；不生成伪精确录用概率；当前期刊政策必须以经核验的官方要求为准',
    fallback: '用户决策：[A] 修高优投 / [B] 全修投 / [C] 不修投 / [D] 换期刊',
    record: '期刊匹配度、桌拒风险高/中/低、模拟审稿意见、转投条件',
  },
  {
    n: 17,
    stage: 'submit',
    name: '审稿意见回复',
    goal: '投稿后收到真实审稿意见时触发',
    outputs: ['docs/投稿/response_to_reviewers.md', 'docs/投稿/修改对照表.md', 'docs/论文/{Project}_Paper_REVISED.tex'],
    primary: 'nature-response',
    aux: [
      { skill: 'nature-writing', trigger: '需要补充论证' },
      { skill: 'nature-polishing', trigger: '需要语言调整' },
      { skill: 'nature-citation', trigger: '回复引入或争议引用' },
    ],
    gate: '强制输出：评论ID、问题分类、响应动作、证据、修改位置、缺失作者输入、提交就绪状态；不得声称未完成的实验或修改已经完成；不得无证据硬拒，也不得为了迎合而接受错误前提',
    fallback: '策略层：基于证据礼貌商榷',
    record: '可追踪回复包、修改对照表、修改稿',
    detail: {
      goldenRules: [
        '永远先感谢审稿人',
        '优先解决问题；必要时用数据、文献或范围边界礼貌商榷',
        '每条回复三要素：感谢 + 说明修改（具体 + 位置）+ 证据',
        '修改处蓝色高亮并标注行号',
        '不要只说“已修改”不说改了什么、不遗漏任何一条、不带防御性语气',
      ],
    },
  },
]

/** Index phases by number for O(1) lookup. */
export const PHASE_BY_N = new Map(PHASES.map((p) => [p.n, p]))

/** Resolve the stage descriptor that owns a phase number. */
export function stageOf(n) {
  return STAGES.find((s) => n >= s.phases[0] && n <= s.phases[1])
}

/** Return the gate that a phase number is conventionally checked against. */
export function gateForPhase(n) {
  if (n <= 0) return 'G0'
  if (n === 1) return 'G1'
  if (n <= 4) return 'G2'
  if (n <= 6) return 'G3'
  if (n <= 9) return 'G4'
  if (n <= 15) return 'G5'
  return 'G6'
}

/**
 * Phase work-record file name, per the global rule “每 Phase 结束强制工作记录”.
 *
 * The workflow convention is `Phase{N}_{name}.md` and the package keeps file
 * names ASCII-safe where it can, so separators and punctuation collapse to a
 * single underscore (`Phase5_方案设计_框架图_S0-S3.md`).
 */
export function journalFileName(phase) {
  const safe = phase.name
    .replace(/[\\/:*?"<>|]/g, ' ') // illegal on Windows
    .replace(/[+\s]+/g, '_') // separators collapse
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return `Phase${phase.n}_${safe}.md`
}
