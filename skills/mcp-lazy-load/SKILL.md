---
name: mcp-lazy-load
description: 如用户表示要使用 MCP 或加载服务器，按此技能调用三条规则。MCP 懒加载技能：list_mcp_servers → enable_mcp → disable_mcp。工作区配置 .dsh/mcp-servers.json 的 allow/deny 控制授权；deny 单独列可被 enable 解除，同时列 allow+deny 才否决。配置文件自动创建、enable/disable 写透持久化、热加载。仅主预设与三个执行预设可用。
whenToUse: "用户提及 MCP、加载服务器、list_mcp_servers、enable_mcp、disable_mcp 或以任何方式表示需要动态管理 MCP 工具时"
disable-model-invocation: false
user-invocable: true
---

适用预设：主预设 + 三个执行预设（sisyphus-junior / hephaestus / sisyphus）。其它预设无这三条工具。

list_mcp_servers -> 查可用 server（server/connected/toolCount/enabled）
enable_mcp(<server>) -> 从 deny 移入 allow（写盘持久化），下一步生效
disable_mcp(<server>) -> 从 allow 移入 deny（写盘持久化），下一步生效

mask: usable = discovered ∩ allow - deny
deny 单独列 = 已配置未授权，enable 可解除；allow+deny 同时列才硬否决
配置文件 <cwd>/.dsh/mcp-servers.json 自动创建（allow 空，deny 含全部已配置 server）
无授权且已发现 server 时，list 返回 servers: [] 且 message 列出候选 server 名
enable/disable 写透磁盘：allow 授权被同工作区后续会话继承，但 enabled 是每会话内存态，新会话仍需调一次 enable_mcp 才生效（list 显示 enabled:false）
热加载：生效于下一条消息，无需重启 Host
