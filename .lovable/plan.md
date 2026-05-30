## 测试目标
验证当前 Bright Data 集成在真实场景下确实能够：
1. 检测到 story 里的 "trip" 关键词
2. 真正向 Bright Data Web Unlocker 发起 HTTPS 请求（非 mock）
3. 抓回 Trip.com 退款政策原文并落库到 `ota_rules_cache`
4. 写入 4 类 `audit_logs` 事件（triggered / succeeded / cache_hit / failed）
5. Gemini 在分析里真的引用了抓取到的条款（而非凭空编造）

## 你需要先确认的两点（不确定就停）

**Q1 — 测试身份**：要不要我创建一个临时测试用户（email + password），在脚本里登录后再调用 Edge Function？还是你愿意现在用浏览器登录后我借用 preview session 的 JWT？
> 推荐**借用 preview session**：更真实，不会污染用户表。

**Q2 — 抓取范围预期管理（重要）**：当前 allowlist 里 `trip` 只指向一个 URL：
`https://www.trip.com/customerservice/refund-policy`
它**不会**专门去找"性别填错"专项规则，也**不覆盖**新加坡 CPFTA / Small Claims Tribunal。
- 选项 X：**只测现状**——验证 Bright Data 链路通 + Trip 通用退款条款被注入 prompt + Gemini 用新加坡法律的内置知识作答。最快，能证明集成可用，但你那句"新加坡法律以可验证方式来自外部源"做不到。
- 选项 Y：**先小幅扩展 allowlist**——加 `case.org.sg`（新加坡消协官方）和 `cccs.gov.sg`（公平交易委员会），这两个域是公开静态页，加完一起测，"逻辑严谨可验证"才真正成立。需要 ~10 行代码改动 + 1 次 redeploy。

> 推荐 **Y**，否则法律部分仍然只是 LLM 自说自话，不符合你"可验证"的要求。

---

## 测试流程（基于你对 Q1/Q2 的回答）

### 步骤 1 — 清空既有缓存，确保走真实回源
```sql
DELETE FROM ota_rules_cache WHERE ota_name = 'trip';
DELETE FROM audit_logs WHERE action LIKE 'bright_data.%' AND created_at > now() - interval '1 hour';
```
（仅清近 1h 日志，保留历史。）

### 步骤 2 — 构造一条真实 dispute 并触发分析
通过 `supabase--curl_edge_functions` 调 `analyze-dispute`，body 包含你给出的完整 story（含 "Trip"、"新加坡"、"性别填错"、"酒店拒绝入住"）。
- 先 `INSERT` 一条 `disputes` 行（user_id = 当前登录用户，category='hotel', country='Singapore'）
- 拿到 dispute_id → POST 给 Edge Function
- 记录返回的 analysis_id

### 步骤 3 — 验证 Bright Data 真的被调用（不是 mock）
并行查 3 张表，**全部要满足**才算通过：

| 验证点 | SQL / 检查 | 通过标准 |
|---|---|---|
| 触发事件已写入 | `SELECT action, metadata FROM audit_logs WHERE resource_type='ota_rules_cache' ORDER BY created_at DESC LIMIT 10` | 必须出现 `bright_data.fetch_triggered` + 之后 `fetch_succeeded`（或 `fetch_failed` + `stale_cache`） |
| 缓存表有新行 | `SELECT ota_name, length(raw_content), content_hash, fetched_at FROM ota_rules_cache WHERE ota_name='trip'` | `length > 500` 且 `fetched_at` 是刚才；`content_hash` 是 64 位 sha256 |
| 抓回的内容真是 Trip.com 退款页 | `SELECT substring(raw_content, 1, 800) FROM ota_rules_cache WHERE ota_name='trip'` | 文本里出现 "refund" / "cancellation" / "Trip.com" 关键词 |

### 步骤 4 — 验证 Gemini 真的"用"了抓回的条款
- 查 `dispute_analyses` 对应行的 `recommendation` 和 `leverage_points`
- 标准：`leverage_points` 中至少 1 条 `source` 指向 Trip.com 政策原文措辞（不是泛泛"根据平台条款"）
- 如果选了 Y：还要看见至少 1 条引用 `case.org.sg` 或 `cccs.gov.sg`

### 步骤 5 — 验证缓存命中分支
立即再调一次同样的 dispute（或新 dispute 但同 story）。预期：
- `audit_logs` 新增 `bright_data.cache_hit`，**不再**出现 `fetch_triggered`
- 响应明显更快（>2s 差异）

### 步骤 6 — 验证降级路径（可选但推荐）
临时把 `BRIGHT_DATA_API_KEY` 改成无效值 → 再调一次 → 应看到 `fetch_failed` + 返回的 prompt 仍然包含上一次缓存内容（`source: stale_cache`），分析不中断。完事后还原 key。
> 这一步需要你授权改 secret，**默认跳过**，除非你说要测。

---

## 你会拿到的最终交付物
1. 一份"逐步骤通过/失败"清单（含每步的 SQL 真实返回片段）
2. 抓回的 Trip.com 退款条款原文摘录（前 ~1KB 给你肉眼核对）
3. Gemini 最终分析里**实际引用的条款句**，与抓回原文一一对应（这就是"可验证"）
4. 如选 Y：新加坡 CPFTA / CASE 相关条文摘录 + 在分析里的引用位置

---

## 我现在停下，等你回答：
- **Q1**：preview session JWT（推荐） / 新建测试账号 / 其他？
- **Q2**：选项 X（只测现状） / 选项 Y（先加 SG 法律源再测，推荐）？
- 步骤 6 降级测试：跳过 / 执行？