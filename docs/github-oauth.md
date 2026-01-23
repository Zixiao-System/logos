# GitHub OAuth (Device Flow)

## 配置

1. 在 GitHub 创建 OAuth App。
2. 获取 Client ID（可选：Client Secret）。
3. 启动应用前设置环境变量：

```
GITHUB_OAUTH_CLIENT_ID=your_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
```

## 使用

1. 打开 `设置` → `DevOps / CI/CD` → `GitHub OAuth`。
2. 点击 “GitHub 登录”，浏览器会打开授权页面。
3. 输入界面显示的验证码完成授权。
4. 授权成功后 Token 会自动写入设置中的 GitHub Token。

## 权限建议

默认申请 `repo`、`workflow`、`read:user`。

