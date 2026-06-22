# ae-actions/v1

模型返回对象必须包含 `version`、`summary`、`risk`、`projectRevision` 和 `actions`。插件会先使用 JSON Schema 校验，再检查工程版本，最后交给 ExtendScript 白名单执行器。

允许动作：

- `project.context`
- `comp.create`
- `layer.text.create`、`layer.shape.create`、`layer.solid.create`
- `property.set`
- `keyframe.set`、`keyframe.delete`
- `expression.set`
- `effect.add`、`effect.parameter.set`
- `footage.import`
- `layer.delete`

`layer.delete` 和 `keyframe.delete` 属于危险动作，必须二次确认。协议不接受脚本字符串、工程项删除或磁盘删除操作。
