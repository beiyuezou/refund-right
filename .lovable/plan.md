# 方案 B：改用 Datacenter Proxy（`datacenter_proxy1`）抓取

放弃 Web Unlocker `/request` JSON API，改走 Bright Data 标准 HTTP 代理通道，复用你已有的 `datacenter_proxy1` zone。

## 需要你先准备的两个值

调用 `add_secret` 收集（不会出现在日志/代码里）：

1. **`BRIGHT_DATA_CUSTOMER_ID`** — Bright Data 控制台左上角，形如 `hl_xxxxxxxx`（不是 API Key）。
2. **`BRIGHT_DATA_ZONE_PASSWORD`** — `datacenter_proxy1` zone 详情页 → Access parameters → Password（**zone 专属密码**，不是账号密码、也不是 API Key）。

`BRIGHT_DATA_ZONE_ID=datacenter_proxy1` 保持不变；`BRIGHT_DATA_API_KEY` 暂时保留（本方案不用，但留着不影响）。

## 代码改动（仅 `supabase/functions/_shared/bright-data-service.ts`）

替换 `fetchOtaRules` 内的「2. Cache miss → 调用 Bright Data」段，约 40 行：

- 读取 `BRIGHT_DATA_CUSTOMER_ID` / `BRIGHT_DATA_ZONE_ID` / `BRIGHT_DATA_ZONE_PASSWORD`；任一缺失 → 走原有 `stale_cache` / `none` 降级。
- 用 Deno 标准库 `npm:https-proxy-agent` 风格不可用 → 改用 Deno 原生 `Deno.createHttpClient({ proxy: { url, basicAuth } })` + `fetch(url, { client })`：
  - `url`: `http://brd.superproxy.io:22225`
  - `basicAuth.username`: `brd-customer-${customerId}-zone-${zone}`（可追加 `-country-sg` 提升 SG 站点成功率，先不加，保持最小改动）
  - `basicAuth.password`: zone password
- 保留现有 `AbortController` 12s 超时、`MAX_CONTENT_BYTES` 截断、`stripHtml`、SHA-256 去重、`ota_rules_cache` upsert、`audit_logs` 全部埋点（`bright_data.fetch_triggered/succeeded/failed`）。
- 失败分支文案标注 `transport: "datacenter_proxy"`，方便日后区分。
- 其他文件（`analyze-dispute/index.ts`、allowlist、`detectLegalSources`、SG 法律源）零改动。

## 风险与降级承诺

- Datacenter Proxy 在 Trip.com / case.org.sg / cccs.gov.sg 这类有 anti-bot 的站点上**预期会出现 403 / captcha / 空白 HTML**。
- 失败时严格走原有降级链：`stale_cache` → `none`，绝不抛错断主链；AI 分析仍能凭 dispute story + 本地知识完成输出，只是 ground-truth context 为空。
- 我会在测试报告里**逐 OTA / 逐法律源**标明：`live` / `cache` / `stale_cache` / `none`，并给出 HTTP 状态码或被识别为 bot 的迹象，让你清楚看到 Datacenter 路线的真实命中率。

## 部署 + 验证流程

1. 你点击「Add secret」填入 `BRIGHT_DATA_CUSTOMER_ID` + `BRIGHT_DATA_ZONE_PASSWORD`。
2. 我改 `bright-data-service.ts` → `deploy_edge_functions(["analyze-dispute"])`。
3. 清空 `ota_rules_cache` 中 trip / sg_case / sg_cccs 三行（强制 live 抓取）。
4. 用 preview session JWT 跑【Trip.com 性别填错 + 新加坡酒店拒退】案例。
5. 交付：`audit_logs` 中 5 条 `bright_data.*` 事件 + 每条 source 的命中状态 + 最终 AI 输出截取。

## 如果 Datacenter 全线 403

我会**当场停下叫你**，给出两条出路：
- 回到方案 A 新建 Web Unlocker zone；
- 或加 `-country-sg` 国家定向 + 重试一次。

不会自作主张切换或继续烧 quota。

确认计划无误就点 Approve，我立即进入收集 secret → 改代码 → 部署 → 测试。
