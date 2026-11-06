# 资料采集与审核记录（REVIEW_LOG）

本文件记录 P1-02「资料采集、复核、渠道映射」的采集来源、核验状态与待办。
对应设计文档：`开发文档/01-资料底座-三期设计开发.md` §2.2/§2.3/§2.5/§2.6，`开发文档/05-实施顺序与分期验收.md` §7。

关键原则：
- **AI 不得把任何记录标记为 `verified`。** 人工第二遍核对来源后方可置为 `verified`（§2.3.5、§7「模型自评不能代替审核」）。
- 采集阶段所有记录一律 `reviewStatus = "needs_review"`，`reviewer = "ai-collection-draft"`。
- **未核验的电话/网址一律留 `null`**（§2.2「没有核验时显示『尚未核实』，不让模型补全」）。
- 只写入实际抓取确认的原文；未在开发文档或凭记忆猜测 URL / 法条。
- `supportedCities` 由构建脚本从 `verified` 且未过期的记录派生；当前为空，故应用对郑州如实返回 `coverage = unsupported`（§2.5「不因创建配置项即显示为已支持」）。

---

## 1. 采集来源清单（已写入 sources.json）

| source id | 名称 | 层级 | 施行 | officialUrl | URL 抓取核验 | 原文核验 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| src-housing-rental-regulation | 住房租赁条例（国务院令第812号） | 全国 | 2025-09-15 | https://www.gov.cn/gongbao/2025/issue_12186/202507/content_7034094.html | 已核验可访问 | 第十条经 6+ 独立来源逐字互证 | needs_review |
| src-zhengzhou-rental-ordinance | 郑州市住房租赁管理条例 | 地方(410100) | 2025-01-01（2026 修正） | https://www.zzrd.gov.cn/law/print.aspx?nid=122 | 已核验 | 第二十四条、备案条逐字；**序号存疑** | needs_review |
| src-zhengzhengban-2025-13 | 郑政办〔2025〕13号 通知 | 地方(410100) | 2025-04-01 | https://public.zhengzhou.gov.cn/D0102X/9191560.jhtml | 已核验 | 押金/租金上限句逐字 | needs_review |

采集要点：
- **住房租赁条例第十条**（逐字）：「出租人收取押金的，应当在住房租赁合同中约定押金的数额、返还时间以及扣减押金的情形等事项。除住房租赁合同约定的情形以外，出租人无正当理由不得扣减押金。」
  - 该条例仅规定「不得无正当理由扣减」，**未直接规定违法扣押金的罚则**；救济需结合其他条款或渠道，已在 applicabilityNotes 标注。
- **郑州条例第二十四条**（逐字，资金监管专用账户，约束转租经营企业）。
  - ⚠️ **待人工核对**：2026 年修正（2026-06-30 通过、2026-08-01 批准）后条文序号可能变动。两次抓取对「第十二条」内容出现冲突（一说合同内容/租金押金数额，一说备案）。因此本次**只写入有可靠逐字文本的条款**，涉及「合同应载明租金和押金数额」的条款序号待人工确认后再补录。
- **郑政办〔2025〕13号**（逐字）：「企业向承租人单次收取的租金金额一般不得超过3个月，收取的押金金额一般不得超过1个月租金，并按照规定通过资金监管专用账户纳入监管。」用词为「一般不得超过」，属指导性上限，已在 applicabilityNotes 标注个案例外需核实。

## 2. 渠道映射（已写入 channels.json，cityCode 均为 410100）

全部 `needs_review`；`phone` 与 `officialUrl` 均为 `null`（本次采集未逐项核验官方联系方式，避免写入未核实热线/网址）。

| channel id | 名称 | kind | 受理对象 | 待核实项 |
| --- | --- | --- | --- | --- |
| zz-ch-negotiation | 与出租方协商退还 | negotiation | 全部 | 无（流程性渠道） |
| zz-ch-enterprise | 租赁企业/平台内部投诉 | enterprise | 中介/运营方 | 具体企业入口 |
| zz-ch-consumer | 消费者投诉举报渠道 | consumer | 中介/运营方 | **官方电话（如 12315）与受理范围待核实** |
| zz-ch-housing-admin | 住房保障和房地产管理部门投诉 | administrative | 中介/运营方 | **官方电话/网址、对个人房东直租的受理范围待核实** |
| zz-ch-mediation | 人民调解 | mediation | 全部（需双方同意） | 属地调解组织入口 |
| zz-ch-legal-consultation | 公共法律服务咨询 | legal_consultation | 全部 | **官方电话（如 12348）待核实** |
| zz-ch-legal-aid | 法律援助 | legal_aid | 全部 | **经济困难等资格须单独核验，不承诺免费代理** |
| zz-ch-litigation | 向人民法院提起诉讼 | litigation | 全部 | 管辖法院、时效由专业人士评估 |

> 说明：`eligibility.ts` 对 `consumer`（个人房东）与 `legal_aid` 强制返回 `needs_check`，与上表「受理范围/资格待核实」一致，不默认适用、不承诺结果。

## 3. 规则（已写入 rules.json）

| ruleId | 场景 | 引用 | 备注 |
| --- | --- | --- | --- |
| rule-deposit-agreement-required | deposit_deducted | art-hrr-10 | 扣押金须有合同/法律依据 |
| rule-deposit-return-negotiation-first | deposit_not_returned | art-hrr-10 | 先协商核实、留证，再走后续渠道 |
| rule-zhengzhou-enterprise-fund-supervision | deposit_deducted | art-zzo-24, art-zzb13-deposit | 郑州转租企业资金监管账户 |

> 注意：诊断流程的排序 `orderGroup` 由渠道 `kind` 在 `eligibility.ts` 中派生；`rules.json` 目前用于引用闭合校验与解释性说明，未直接驱动路径排序。

## 4. 待采集 / 待核验清单（**未写入 JSON，不猜测 URL**）

- **《中华人民共和国民法典》**（主席令第四十五号）合同编租赁合同相关条款：曾尝试的 gov.cn 链接返回 404，故**未写入**。需从官方来源重新采集确认现行有效版本与准确条文号后再补录。
- **《商品房屋租赁管理办法》**（住建部令第6号，2011-02-01 施行）第七条：与 2025《住房租赁条例》的并存/时效关系待确认，官方 mohurd.gov.cn 准确链接待核验。
- **《郑州市住房租赁资金监管办法（试行）》（郑房〔2021〕72号）**：关键规则「合同期满后10日内双方无异议，监管自动解除，监管银行将押金退回承租人」；适用主体为住房租赁企业（转租经营），个人房东是否适用待确认；官方链接待核验。
- 郑州房管局官方法规门户（列出上述文件文号）：`http://fwzl.zfbzj.zhengzhou.gov.cn:8080/rent/api/web/zcfg_index.html?type=1`（http+8080，WebFetch 会升级为 https 可能失败，尚未逐页核验）。
- 各渠道官方电话/网址（12315、12348、住建部门、调解组织、法律援助中心）。

## 5. 人工复核 checklist（置为 verified 前必须逐项完成）

1. 打开每条 `officialUrl`，确认现行有效、内容与 JSON `text` **逐字一致**。
2. 核对施行日期、修正版本、条文序号（尤其郑州条例 2026 修正后的序号）。
3. 核对 `interpretation` 是否忠实原文，删除或修正任何超出原文的表述。
4. 逐渠道核实受理对象、受理范围、官方电话/网址，把 `null` 替换为已核实值或保持「尚未核实」。
5. 核实法律援助资格条件，避免任何「免费代理」承诺。
6. 单人团队需**独立第二人复核并留痕**（§2.3.5）。
7. 复核通过后：将对应记录 `reviewStatus` 改为 `"verified"`、`reviewer` 改为真实复核人、`reviewedAt`/`reviewDueAt` 更新为实际日期，重跑 `npm run build:knowledge`，确认 `supportedCities` 派生出 `410100`。

## 6. 构建与校验

- 命令：`npm run build:knowledge`（`scripts/build-knowledge.mjs`）。
- 校验项：字段类型、来源/条文引用闭合、证据 id 闭合、地域一致性、`supportedCities` 派生。
- 产物：`app/functions/data/knowledge-snapshot.ts`（生成文件，勿手改；`synthetic = false`）。
- 最近一次构建：sources=3 / channels=8 / rules=3，verified=0，supportedCities=[]（草稿态，符合预期）。
