# Bailian proxy for Function Compute

Deploy this directory as an Alibaba Cloud Function Compute Web Function.

Recommended settings:

- Region: China (Hangzhou)
- Runtime: Custom Runtime / Node.js 20
- Start command: `npm start`
- Listening port: `9000`
- Public internet URL: enabled

Required environment variables:

```text
DASHSCOPE_API_KEY=<set only in Function Compute>
BAILIAN_PATIENT_APP_ID=78d7b6cfd1c3480a950bb9a1f38e3afc
BAILIAN_SESSION_APP_ID=6784c6239a3048208ecd4f9ab1d79ebe
BAILIAN_REPORT_APP_ID=5335c37d57f94cae8324356af5117176
ALLOWED_ORIGIN=https://rongmomo.lyshowcase.com
DEBUG_AI_OUTPUT=false
```

Optional for a non-default Bailian workspace:

```text
DASHSCOPE_WORKSPACE_ID=<workspace id>
```

## AI 调试日志

函数会为每次 AI 请求生成 `requestId`，并输出单行 JSON 结构化日志：

- `request_started`：开始调用
- `ai_completed`：同步百炼调用成功，包含耗时和 token usage
- `ai_async_upstream_failed`：异步任务提交或查询失败
- `ai_response_invalid`：模型输出缺字段或不是合法 JSON
- `request_failed`：代理最终返回错误

需要检查“生成内容不好”而不只是接口错误时，可在 Function Compute 中临时设置：

```text
DEBUG_AI_OUTPUT=true
```

此时会额外记录 `ai_debug_output`。排查完成后应恢复为 `false`，避免长期保存生成内容。
日志不会记录 API Key、Authorization header 或请求正文。

Health endpoint:

```text
GET /health
```

AI routes:

```text
POST /api/ai/session            # 提交完整疗程异步任务，立即返回 taskId
GET  /api/ai/session/{taskId}   # 查询任务；处理中返回 202，完成后返回疗程 JSON
POST /api/ai/patient  # 旧患者工作流，保留用于人工回滚
POST /api/ai/report   # 五针结束后的疗程总结
```

前端每 5 秒查询一次，最长等待 100 秒。生成结果只缓存为“下一局”，不会替换正在显示或游玩的患者。
