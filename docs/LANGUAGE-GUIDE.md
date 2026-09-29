# 语言设置 / Language settings

## 中文

系统首次打开时显示简体中文。点击页面顶部的 **English** 可切换为英文；点击 **中文** 可切回。选择保存在当前浏览器，刷新页面后仍然有效。同一账号在另一台设备上首次打开时仍以简体中文显示。

通知、错误提示与 CSV 导出采用当前选择的语言。CSV 的列名会翻译，列顺序、标识符和数值保持不变。如果使用脚本直接访问 API，不发送 `Accept-Language` 时保持原有英文响应；发送 `Accept-Language: zh-Hans-MY` 可获得中文错误、通知和 CSV 表头。用户输入的姓名、备注等内容不会自动翻译。

## English

The app opens in Simplified Chinese by default. Use **English** at the top of the page to switch to English, and **中文** to switch back. The choice is saved in this browser and survives a refresh. A different device starts in Chinese.

Notifications, error messages, and CSV exports follow the selected language. CSV headers are translated while column order, identifiers, and numeric values remain unchanged. Direct API clients retain English responses without `Accept-Language`; send `Accept-Language: zh-Hans-MY` for Chinese errors, notifications, and CSV headers. Names and notes entered by users are not translated.
