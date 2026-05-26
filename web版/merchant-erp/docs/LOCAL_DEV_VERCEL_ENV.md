# 本地 `npm run dev` 如何使用 Vercel 上的环境变量

**结论**：Vercel 控制台里的变量**不会自动进你电脑**。本机启动 `npm run dev` 时，只读 **`web版/merchant-erp` 下的 `.env` / `.env.local`**。

下面是常见报错与正确做法。

## 报错：`cd: no such file or directory: web版/merchant-erp`

说明当前目录不对。`web版/merchant-erp` 是**仓库内部**的子目录，必须从 **Git 项目根目录**（能看到 `web版`、`墨典商家小程序` 等文件夹的那一层的上级）进场。

请先 `cd` 到你克隆下来的 **「墨典/项目」** 根路径，例如在终端里可先找到仓库：

```bash
# 将下面路径改成你电脑上「项目」文件夹的真实路径（不要停在 ~ 就直接 cd）
cd "/Users/damowangOS/墨典AI智能ERP/墨典/项目"

# 确认存在（应有输出）
ls web版/merchant-erp/package.json
```

若没有该路径：在 Finder 里打开本项目根目录 → 拖到终端窗口可自动填入路径。

进到根目录之后再：

```bash
cd web版/merchant-erp
npm run dev
```

## 报错：`Your codebase isn't linked to a project on Vercel`

第一次在本机用时，需要先 **关联你在 Vercel 上的同名项目**。本仓库的线上部署通常为 **把整个仓库设为 Vercel 项目**，因此 **`vercel link` 建议在仓库根目录执行**（与 `vercel.json` 在根目录的那一版一致）。

在**项目根目录**执行：

```bash
cd "/你的路径/墨典AI智能ERP/墨典/项目"
npx vercel link
```

按提示登录浏览器、选对 **Team / Project**（与你在 Vercel 仪表盘里的一致）。完成后目录下会出现 `.vercel/`（一般已写入 `.gitignore`，勿提交）。

然后**仍在根目录**，把 Development 环境的变量拉到文件（避免直接覆盖你已手改的 `.env.local`）：

```bash
npx vercel env pull web版/merchant-erp/.env.vercel-development --environment development --yes
```

用编辑器打开 `web版/merchant-erp/.env.vercel-development`，把里面的 `MERCHANT_AI_*`、`DASHSCOPE_API_KEY`、`TOKENMIX_API_KEY` 等需要用到的行合并进 **`web版/merchant-erp/.env.local`**。

若你要调试 **商家小程序 + 跳过登录**，在 **`web版/merchant-erp/.env.local`** 里还要有（仅本地，上架勿滥用）：

```bash
MEOO_AI_CHAT_ALLOW_UNAUTHENTICATED=1
```

可参考同级目录旁的 `.env.development.agent.example`。

最后：

```bash
cd web版/merchant-erp
npm run dev
```

改完 `.env.local` **必须重启 dev**。

> 若在子目录做过 `vercel link`、仍拉不到变量，删掉该目录下的 `.vercel` 后回到 **仓库根** 再执行一次 `npx vercel link`。

## 方式 B：不拉取，直接使用线上 HTTPS

把小程里的 `MERCHANT_API_BASE_URL` 改成你已部署的 **Vercel 站点域名**。Key 只在服务端配置，不需写进本地 `.env.local`，但要处理微信小程序合法域名、HTTPS 与用户登录。
