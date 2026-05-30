# 方案 B：Bright Data `/request` API + `datacenter_proxy1` zone

## 目标
RefundRight 在 AI 分析时实时抓取 OTA 退款政策、SG 法律源，作为 Ground Truth 注入 Gemini，不硬编码、不暴露密钥。

## 关键洞察
Bright Data `POST https://api.brightdata.com/request` 是**账号级 API**，对所有 zone 类型（Web Unlocker / Datacenter / Residential）通用，只需传 `zone` 名字。现有 `supabase/functions/_shared/bright-data-service.ts` 代码**完全不用改**，只需把 secret `BRIGHT_DATA_ZONE_ID` 设成 `datacenter_proxy1`。

凭证用账号级 **API token**，不是 zone 代理密码 — 满足"不能硬编码、注重安全"的要求。

## 需要你确认/提供的 Secret

| Secret | 值 | 来源 |
|---|---|---|
| `BRIGHT_DATA_API_KEY` | 账号级 API token | Bright Data 控制台 → Account settings → API tokens |
| `BRIGHT_DATA_ZONE_ID` | `datacenter_proxy1` | 已知 |
| `BRIGHT_DATA_CUSTOMER_ID` | `hl_340d21df` | 已知（仅留作审计，运行时不用） |

如果不确定当前 `BRIGHT_DATA_API_KEY` 是不是账号 token（可能误填成了 zone password），我会发起 `update_secret` 让你重新粘贴。

## 改动范围

| 文件 | 改动 |
|---|---|
| Secret `BRIGHT_DATA_ZONE_ID` | 设为 `datacenter_proxy1` |
| Secret `BRIGHT_DATA_API_KEY` | 必要时重填账号 token |
| `bright-data-service.ts` | **零改动** |
| `analyze-dispute/index.ts` | **零改动** |
| DB / RLS / Auth / UI / i18n / Gemini prompt | **零改动** |

## 安全
- 三个 secret 全部走 Lovable Cloud secrets，`Deno.env.get()` 读取，永不进代码/日志/前端
- SSRF allowlist 已存在（7 OTA + 2 SG 法律源），调用方传入的 URL 被忽略，只用 allowlist URL
- `audit_logs` 完整埋点：`bright_data.fetch_triggered/succeeded/failed/cache_hit`
- 失败 3 级降级：`live → cache → stale_cache → none`，**绝不中断主流程**；失败时 AI 仍能基于 dispute 描述 + `src/lib/knowledge.ts` 本地法律基线给出回答

## 部署 + 验证流程

1. 你点 Approve
2. 我调 `update_secret(["BRIGHT_DATA_ZONE_ID"])`（必要时含 `BRIGHT_DATA_API_KEY`），你在弹窗里粘贴
3. `deploy_edge_functions(["analyze-dispute"])`
4. 清空 `ota_rules_cache` 中 trip / sg_case / sg_cccs 三行 → 强制 live
5. 用 preview session JWT 跑【Trip.com 性别填错】+【SG 酒店拒退】两个真实 case
6. 交付报告，逐源标注：HTTP 状态 / `live|cache|stale_cache|none` / 命中字节数 / AI 最终输出片段

## Datacenter 路线的真实风险

Datacenter IP 在反爬严格的站点（Trip.com / case.org.sg / cccs.gov.sg）大概率 **403 / captcha / 空白 HTML**。Agoda / Booking / Klook 通常能过。

**如果 Trip.com 或 SG 法律源全线 403**，我**立刻停下汇报**，给你两条路：
- **B+**：去 Bright Data 控制台开一个 Web Unlocker zone（免费试用，5 分钟），把 `BRIGHT_DATA_ZONE_ID` 改成新 zone 名 → 重跑（命中率 95%+）
- **回滚**：保留 stale cache，不做外部抓取

**绝不**自作主张烧 quota 或切方案。

确认就点 Approve，我立即进入 secret 收集 → 部署 → 测试。
