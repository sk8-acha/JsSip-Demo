# JsSIP Demo - WebRTC 软电话示例

基于 [JsSIP](https://jssip.net/) 的 WebRTC 软电话示例项目，纯前端实现，通过 SIP over WebSocket (WSS) 连接 SIP 服务器，支持签入、外呼、来电接听、保持、转接等通话功能。适合作为 Web 软电话、呼叫中心坐席条的参考实现。

## 功能特性

- **SIP 签入 / 退签**：手动填写 SIP 配置，完成注册与注销
- **外呼**：输入号码发起语音呼叫
- **来电接听 / 拒接**：弹窗展示来电，支持接听或拒接
- **通话保持 / 恢复**：保持当前通话后恢复
- **转接**：将当前通话转接至指定号码
- **坐席状态**：空闲、置忙、休息

## 项目结构

```
JsSip-Demo/
├── index.html       # 主页面，签入表单 + 通话控制 UI
├── call.js          # 核心逻辑：SIP 注册、通话控制、状态管理
├── jssip-3.4.4.js   # JsSIP 库（需自行放入）
└── README.md
```

## 环境要求

- 现代浏览器（Chrome、Firefox、Edge、Safari），支持 WebRTC、WebSocket
- HTTPS 或 `localhost` 环境（麦克风等媒体设备需安全上下文）
- 可访问的 SIP 服务器（支持 SIP over WebSocket）

## 快速开始

### 1. 获取 JsSIP

从 [JsSIP 官网](https://jssip.net/) 或 [GitHub](https://github.com/versatica/JsSIP) 下载 `jssip-3.4.4.js`，放入项目根目录。

### 2. 启动本地服务

通过 HTTP(S) 访问，直接双击打开 `index.html` 可能因安全策略无法使用麦克风或 WebSocket。

### 3. 打开页面

浏览器访问 `http://localhost:8080`（或对应端口），填写 SIP 配置后点击「签入」。

## 配置说明

| 参数 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| SIP 服务器 | SIP 域名，如 `sip.example.com` | 是 | - |
| 用户名 / 分机号 | SIP 账号或分机号 | 是 | - |
| 密码 | SIP 认证密码 | 是 | - |
| WSS 端口 | WebSocket Secure 端口 | 是 | 8443 |
| STUN 地址 | ICE/STUN 服务器，用于 NAT 穿透；留空则使用 SIP 服务器 | 否 | - |
| STUN 端口 | STUN 服务端口 | 是 | 3478 |

签入时会校验必填项及端口范围（1–65535）。

## 使用流程

1. 在左侧填写 SIP 服务器、用户名、密码等
2. 点击「签入」，等待状态变为「已注册」
3. 在右侧输入框输入号码，点击「外呼」发起呼叫
4. 来电时弹窗显示，可点击「接听」或「拒接」
5. 通话中可进行保持、恢复、转接等操作
6. 点击「退签」结束会话并注销