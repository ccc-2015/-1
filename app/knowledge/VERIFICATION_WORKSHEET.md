# 资料核验工作表（VERIFICATION_WORKSHEET）

用途：P1-02v「API 辅助人工核验」。agent 用联网检索（WebFetch 官方页面）逐条拉取官方原文与链接，与 `knowledge/*.json` 做 side-by-side 对照；**人工确认后**用 `scripts/verify-knowledge.mjs` 一键把记录翻为 `verified`。

- 检索执行者：Qoder agent（WebFetch 官方 URL）
- 检索日期：2026-11-07
- 约束：AI 只做「检索+对照」，**不得自行判定 verified**（doc 05 §7、doc 01 §2.3.5）。最终勾选与翻转由人工完成。
- 翻转命令见文末第 5 节。翻转后必须重跑 `npm run build:knowledge`，确认 `supportedCities` 派生出 `410100`。

图例：✅ 一致 / ⚠️ 需人工定夺 / ☐ 待勾选

---

## 1. 来源（sources.json）

### ① src-housing-rental-regulation —— 住房租赁条例（国务院令第812号）
- 官方链接：https://www.gov.cn/gongbao/2025/issue_12186/202507/content_7034094.html （✅ 可访问）
- 元数据核对：812号 ✅ / 通过 2025-06-27 ✅ / 公布 2025-07-16 ✅ / 施行 2025-09-15 ✅（JSON validFrom=2025-09-15 ✅）
- 条文 `art-hrr-10`（第十条）：
  - JSON 原文：「出租人收取押金的，应当在住房租赁合同中约定押金的数额、返还时间以及扣减押金的情形等事项。除住房租赁合同约定的情形以外，出租人无正当理由不得扣减押金。」
  - 检索原文：同上，**逐字一致 ✅**
- 结论：☐ 建议 verified（文本与元数据均一致）

### ② src-zhengzhou-rental-ordinance —— 郑州市住房租赁管理条例
- 官方链接：https://www.zzrd.gov.cn/law/print.aspx?nid=122 （✅ 可访问）
- 元数据核对：2024-08-29 通过 ✅ / 施行 2025-01-01 ✅（JSON validFrom=2025-01-01 ✅）/ 2026-06-30 修正，**条文序号未变 ✅**（此前疑点已澄清）
- 条文 `art-zzo-24`（第二十四条）：
  - JSON 原文：「住房租赁企业从事转租业务的，应当按照规定设立住房租赁交易资金监管专用账户并向社会公示，通过该监管账户办理住房租赁交易资金收付业务。」
  - 检索原文：「…并向社会公示**,**通过该监管账户…」——⚠️ 仅**逗号全角/半角**差异（官方页面用半角 `,`）。属排版差异，不影响含义。
  - 处理建议：为「严格逐字」可把 JSON 改为半角逗号；或保留全角并在此备注。请勾选：☐ 改半角 ☐ 保留全角
- 备注：JSON `applicabilityNotes` 里「2026修正序号可能变动」的提示可更新为「2026修正未改序号」。☐ 同意更新
- 结论：☐ 建议 verified（确认逗号处理后）

### ③ src-zhengzhengban-2025-13 —— 郑政办〔2025〕13号 通知
- 官方链接：https://public.zhengzhou.gov.cn/D0102X/9191560.jhtml （✅ 可访问）
- 条文 `art-zzb13-deposit`：
  - JSON 原文：「企业向承租人单次收取的租金金额一般不得超过3个月，收取的押金金额一般不得超过1个月租金，并按照规定通过资金监管专用账户纳入监管。」
  - 检索原文：同上，**逐字一致 ✅**
- 元数据核对：发文机关 郑州市人民政府办公室 ✅ / 发布 2025-03-26 ✅
- ⚠️ **施行日期冲突（必须定夺）**：本次检索返回「施行=公布之日(2025-03-26)」，但 JSON `validFrom=2025-04-01`（早期采集记录）。二者不一致。
  - 影响：`validFrom` 决定时间适用性判断（早于该日期的事件可能被判为不适用）。
  - 请从官方通知正文/落款的「施行」条款确认，勾选：☐ 改为 2025-03-26（公布之日）☐ 保留 2025-04-01 ☐ 其他：______
- 结论：☐ 施行日期确认后方可 verified

---

## 2. 渠道（channels.json，cityCode 均为 410100）

渠道为**结构性/制度性途径**，类型与受理对象正确即可 verified；官方电话/网址未核验时**保持 `null`（显示「尚未核实」）**，不猜测。

| id | 名称 | 类型/受理对象是否正确 | 电话/网址 | 勾选 verified |
| --- | --- | --- | --- | --- |
| zz-ch-negotiation | 与出租方协商退还 | ✅ 通用首步 | null（无需） | ☐ |
| zz-ch-enterprise | 租赁企业/平台内部投诉 | ✅ 仅经营性主体 | null 待核实 | ☐ |
| zz-ch-consumer | 消费者投诉举报渠道 | ✅ 经营者消费争议 | null 待核实（如 12315） | ☐ |
| zz-ch-housing-admin | 住房保障和房地产管理部门投诉 | ✅ 行业监管 | null 待核实 | ☐ |
| zz-ch-mediation | 人民调解 | ✅ 需双方同意 | null 待核实 | ☐ |
| zz-ch-legal-consultation | 公共法律服务咨询 | ✅ 咨询非代理 | null 待核实（如 12348） | ☐ |
| zz-ch-legal-aid | 法律援助 | ✅ 资格须单独核实 | null 待核实 | ☐ |
| zz-ch-litigation | 向人民法院提起诉讼 | ✅ 兜底途径 | null 待核实 | ☐ |

> 说明：`eligibility.ts` 对 `consumer`（个人房东）与 `legal_aid` 强制 `needs_check`，与「受理范围/资格待核实」一致。
> 若要让郑州「已支持」，**至少需 1 条来源 verified + 1 条本市场景渠道 verified**（build 脚本据此派生 supportedCities）。建议至少勾选 negotiation + consumer + housing-admin + mediation + litigation。
> 电话/网址可后续单独核验补录，不阻塞首次 verified。

---

## 3. 规则（rules.json）

规则引用上述来源条文，来源 verified 后规则引用即闭合。规则本身为解释性排序说明，不单独「verified」，但需确认描述忠实原文：

| ruleId | 引用 | 忠实原文? |
| --- | --- | --- |
| rule-deposit-agreement-required | art-hrr-10 | ☐ |
| rule-deposit-return-negotiation-first | art-hrr-10 | ☐ |
| rule-zhengzhou-enterprise-fund-supervision | art-zzo-24, art-zzb13-deposit | ☐ |

---

## 4. 待办/差异汇总（人工定夺项）

1. ⚠️ 郑政办13号 **施行日期**：2025-03-26 vs 2025-04-01（第 1 节③）。
2. ⚠️ 郑州条例第二十四条 **逗号全角/半角**（第 1 节②）。
3. ☐ 郑州条例 applicabilityNotes 更新为「2026修正未改序号」。
4. ☐ 各渠道官方电话/网址（12315、12348、住建部门、调解、法律援助）——可延后补录，不阻塞 verified。
5. 待采集（未写入 JSON、不猜测 URL）：民法典合同编租赁条款、商品房屋租赁管理办法、郑州市住房租赁资金监管办法（郑房〔2021〕72号）。

---

## 5. 一键翻转 verified（人工确认后执行）

脚本：`scripts/verify-knowledge.mjs`。它会拒绝把 reviewer 写成 AI 草稿标识，要求填入真实复核人。

```bash
# 查看当前状态
node scripts/verify-knowledge.mjs --report

# 翻转（示例）：来源 + 渠道，复核人填真实姓名/工号
node scripts/verify-knowledge.mjs \
  --reviewer "你的姓名" \
  --due 2027-05-07 \
  --approve-src src-housing-rental-regulation,src-zhengzhou-rental-ordinance,src-zhengzhengban-2025-13 \
  --approve-ch zz-ch-negotiation,zz-ch-consumer,zz-ch-housing-admin,zz-ch-mediation,zz-ch-litigation

# 翻转后重建快照（脚本会自动调用），确认 supportedCities 出现 410100
npm run build:knowledge
```

> 单人团队需**独立第二人复核并留痕**（doc 01 §2.3.5）；`--reviewer` 应记录实际复核人。
