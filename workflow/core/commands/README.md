# Core Commands

Each command file is a stage contract. Tools may expose slash commands, prompts, rules, or checklists, but every adapter should point back to these core files.

默认使用简体中文展示阶段沟通和产物；专有名词、产品名、品牌名、代码标识符、命令、文件路径、分支名、API、SDK、框架、协议、标准、错误信息和官方英文术语保留原文。

Stages:

- `/init-workspace`
- `/new-feature`
- `/01-需求讨论`
- `/02-产品文档`
- `/02B-UI设计`
- `/03-技术架构`
- `/03-06-研发准备`
- `/04-代码实现`
- `/04A-前端代码实现`
- `/04B-后端代码实现`
- `/05-代码审查`
- `/06-测试用例`
- `/07-测试执行`
- `/08-验收表格`
- `/09-验收`
- `/10-培训文档`
- `/11-上线邮件通知`
- `/12-复盘总结`
- `/workflow-status`

The initializer writes concrete command files into the target workspace.
