## 目标

把 Bright Data 的 `BRIGHT_DATA_ZONE_ID` 明确设为正确 zone name：`datacenter_proxy1`，然后重新部署 `analyze-dispute` 并用真实 dispute case 验证 live 抓取是否恢复。

## 执行计划

1. **更新运行时 Secret**
   - 将 `BRIGHT_DATA_ZONE_ID` 重设为：`datacenter_proxy1`
   - 保持 `BRIGHT_DATA_CUSTOMER_ID = hl_340d21df` 不变，仅作为账号标识/审计信息。
   - 不改代码、不记录 secret 明文到日志。

2. **部署分析函数**
   - 重新部署 `analyze-dispute`，确保函数读取最新 secret。

3. **清理相关缓存**
   - 清空/失效 `ota_rules_cache` 中与真实测试相关的 Trip.com、Singapore legal sources 等缓存，让测试优先走 live 抓取。

4. **运行真实 case 测试**
   - 使用已登录 session 调用 `analyze-dispute`。
   - 至少复测之前的 Trip.com 争议 case。
   - 如可用，再测一个 Singapore 酒店拒退/消费者保护 case。

5. **检查结果与日志**
   - 查看 `audit_logs` / function logs，确认每个源的状态：`live`、`cache`、`stale_cache` 或 `none`。
   - 重点确认不再出现 `zone "hl_340d21df" not found`。
   - 如果 Bright Data 返回 403/captcha/空白内容，我会停下并报告，不会自行切换方案或继续烧 quota。

## 成功标准

- `BRIGHT_DATA_ZONE_ID` 使用的是 `datacenter_proxy1`，不是 `hl_340d21df`。
- `analyze-dispute` 能完成执行。
- Bright Data 错误不再是 `zone "hl_340d21df" not found`。
- 输出真实测试报告，列出每个外部源抓取状态和最终 AI 分析是否包含 ground truth。