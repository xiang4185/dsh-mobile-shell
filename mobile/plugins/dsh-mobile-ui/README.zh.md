# dsh-mobile-ui

DSH Web 的移动端布局覆盖层。它不重做会话、设置、模型或 Agent 逻辑，而是复用现有 UI/服务：

- 小屏隐藏固定 56px 桌面侧栏，将原侧栏变为左侧滑出抽屉；
- 顶部提供会话抽屉与新建会话按钮，并处理 iPhone Safe Area；
- 空白会话展示标准 / PTC / 极简三个常用 Agent 预设快捷按钮；
- 保留现有模型、推理强度、附件、审批、工具卡片和设置页面；
- 仅在宽度 `<= 820px` 时生效，桌面布局不变。

安装到 Web profile：

```sh
dsh plugin --profile web add ./mobile/plugins/dsh-mobile-ui
```
