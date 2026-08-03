# Bailian proxy for Function Compute

Deploy this directory as an Alibaba Cloud Function Compute Web Function.

Recommended settings:

- Region: China (Beijing)
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
```

Optional for a non-default Bailian workspace:

```text
DASHSCOPE_WORKSPACE_ID=<workspace id>
```

Health endpoint:

```text
GET /health
```
