## 参赛项目名称

<!-- 你的作品 / 项目名称 -->
《一针见血？》 / Needle Roulette


## 团队 / 作者

<!-- 团队名称，或你的 GitHub 用户名；如有其他成员请一并列出 -->
我的Github用户名：ly-tt

## 我做了什么

<!-- 简述你用了哪个 Skill / 百炼能力，完成了什么任务、解决了什么问题 -->
我开发了一款可以直接在手机浏览器运行的 3D 互动小游戏。
玩家需要旋转、缩放并观察 3D 手部模型，根据穴位提示完成五次“扎针”。系统会结合落点距离、手心/手背方向和触发区域，产生正常刺激、出血、神经刺激、青紫、碰到硬组织等不同结果，并通过粒子、闪光、手部抖动、颜色变化、音效和剧情对白进行反馈。
项目接入了阿里云百炼 Workflow：
1. 生成虚拟患者
   每局生成不同的患者姓名、年龄、性格、怕疼程度、血管难度和开场对白。
2. 生成疗程总结
   根据五次扎针记录、最终患者状态和命中结果，生成患者对白、趣味评价和分享文案。
3. 维护连续疗程状态
   五次扎针并非相互独立。疼痛、出血、青紫、麻木和信任值会持续累积，并影响最终报告。
为了保护 API Key，我使用阿里云 Function Compute 搭建了服务端代理，并加入 CORS、输入校验、限流、超时控制、JSON Schema 校验、结构化日志和本地 fallback。前端不会直接接触百炼 API Key。



## 使用的工具

- **OpenWork / 百炼 CLI：** 用于项目开发、调试和 AI 能力接入
- **百炼能力 / 模型：** 阿里云百炼大模型节点、应用 Workflow
- **Skill / Workflow 名称：**
  - `needle-generate-patient`：生成虚拟患者
  - `needle-generate-report`：生成五针疗程总结
- **前端技术：**
  - React
  - TypeScript
  - Vite
  - React Three Fiber
  - Three.js
- **云服务：**
  - 阿里云百炼
  - 阿里云 Function Compute
  - 阿里云 OSS 静态网站托管
  - 自定义域名与 HTTPS
- **3D 资源：**
  - hand-topology-study 手部模型
- **其他：**
  - Git / GitHub
  - VS Code
  - Codex

## 效果展示

<!-- 贴一张截图或成片，或描述你的产出结果。截图可直接粘贴。 -->

作品支持手机浏览器直接访问。

<img width="389" height="656" alt="Image" src="https://github.com/user-attachments/assets/ea3d4b9c-6035-4ee9-bcce-7efa03995d17" />
<img width="367" height="643" alt="Image" src="https://github.com/user-attachments/assets/db7d5c5f-f1a0-4f26-84e1-ad243f7ae958" />
<img width="715" height="1294" alt="image" src="https://github.com/user-attachments/assets/4ac20ada-25c6-43e0-aa88-0566af6961e6" />


## 项目链接（可选）

<!-- GitHub 仓库 / 在线 Demo / 视频链接等 -->
- **在线 Demo：** https://rongmomo.lyshowcase.com/
- **GitHub 仓库：** https://github.com/ly-tt/RongMoMo


## 踩坑记录（可选）

<!-- 遇到了什么问题？怎么解决的？ -->


