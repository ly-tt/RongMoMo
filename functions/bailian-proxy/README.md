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
- `ai_completed`：百炼调用成功，包含耗时和 token usage
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
