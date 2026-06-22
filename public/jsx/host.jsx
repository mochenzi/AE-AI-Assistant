/* eslint-disable */
var AEAI = AEAI || {};
(function () {
  function ok(value) { return JSON.stringify({ ok: true, value: value }); }
  function fail(message) { return JSON.stringify({ ok: false, error: String(message) }); }
  function activeComp() { var item = app.project && app.project.activeItem; return item && item instanceof CompItem ? item : null; }
  function findComp(ref, created) {
    if (created && created[ref]) return created[ref];
    for (var i = 1; i <= app.project.numItems; i++) { var item = app.project.item(i); if (item instanceof CompItem && (item.id === ref || item.name === ref)) return item; }
    return activeComp();
  }
  function findProperty(layer, path) {
    var current = layer;
    for (var i = 0; i < path.length; i++) { current = current.property(path[i]); if (!current) throw new Error('找不到属性：' + path.join(' > ')); }
    return current;
  }
  function revision() {
    var comp = activeComp(), selected = [], count = 0;
    if (comp) { count = comp.numLayers; for (var i = 0; i < comp.selectedLayers.length; i++) selected.push(comp.selectedLayers[i].index); }
    return [app.project.file ? app.project.file.fsName : 'unsaved', comp ? comp.id : 0, count, selected.join(',')].join('|');
  }

  AEAI.getProjectContext = function () {
    try {
      var comp = activeComp(), layers = [];
      if (comp) for (var i = 0; i < comp.selectedLayers.length; i++) {
        var layer = comp.selectedLayers[i];
        layers.push({ id: layer.index, name: layer.name, type: layer.matchName, inPoint: layer.inPoint, outPoint: layer.outPoint });
      }
      return ok({ projectName: app.project.file ? app.project.file.name : '未保存工程', projectPath: app.project.file ? app.project.file.fsName : '', revision: revision(), activeComp: comp ? { id: comp.id, name: comp.name, width: comp.width, height: comp.height, duration: comp.duration, frameRate: comp.frameRate, layerCount: comp.numLayers } : null, selectedLayers: layers });
    } catch (e) { return fail(e.toString()); }
  };

  AEAI.executePlan = function (encodedPlan) {
    var plan;
    try { plan = JSON.parse(decodeURIComponent(encodedPlan)); } catch (e) { return fail('动作 JSON 无法解析'); }
    if (plan.version !== 'ae-actions/v1') return fail('不支持的动作协议版本');
    if (plan.projectRevision !== revision()) return fail('AE 工程在预览后发生变化，请重新生成计划');
    var results = [], created = {};
    app.beginUndoGroup('AE AI Assistant: ' + plan.summary);
    try {
      for (var i = 0; i < plan.actions.length; i++) {
        var a = plan.actions[i], comp, layer, prop, effect;
        if (a.type === 'project.context') results.push({ index: i, ok: true });
        else if (a.type === 'comp.create') { comp = app.project.items.addComp(a.name, a.width, a.height, 1, a.duration, a.frameRate); created[a.id] = comp; results.push({ index: i, ok: true, id: comp.id }); }
        else if (a.type === 'footage.import') { var imported = app.project.importFile(new ImportOptions(new File(a.path))); results.push({ index: i, ok: true, id: imported.id }); }
        else {
          comp = findComp(a.compId, created); if (!comp) throw new Error('找不到目标合成');
          if (a.type === 'layer.text.create') { layer = comp.layers.addText(a.text); layer.name = a.name; }
          else if (a.type === 'layer.shape.create') { layer = comp.layers.addShape(); layer.name = a.name; }
          else if (a.type === 'layer.solid.create') { layer = comp.layers.addSolid(a.color, a.name, a.width, a.height, 1, a.duration); }
          else { layer = comp.layer(a.layerId); if (!layer) throw new Error('找不到目标图层 #' + a.layerId); }
          if (a.type === 'property.set') findProperty(layer, a.propertyPath).setValue(a.value);
          else if (a.type === 'keyframe.set') findProperty(layer, a.propertyPath).setValueAtTime(a.time, a.value);
          else if (a.type === 'keyframe.delete') findProperty(layer, a.propertyPath).removeKey(a.keyIndex);
          else if (a.type === 'expression.set') { prop = findProperty(layer, a.propertyPath); if (!prop.canSetExpression) throw new Error('该属性不支持表达式'); prop.expression = a.expression; }
          else if (a.type === 'effect.add') { effect = layer.property('ADBE Effect Parade').addProperty(a.matchName); if (!effect) throw new Error('无法添加效果 ' + a.matchName); }
          else if (a.type === 'effect.parameter.set') { effect = layer.property('ADBE Effect Parade').property(a.effectMatchName); if (!effect) throw new Error('找不到效果 ' + a.effectMatchName); prop = effect.property(a.parameterMatchName); if (!prop) throw new Error('找不到效果参数 ' + a.parameterMatchName); prop.setValue(a.value); }
          else if (a.type === 'layer.delete') layer.remove();
          results.push({ index: i, ok: true });
        }
      }
      return ok({ results: results, revision: revision() });
    } catch (e) { return fail('第 ' + (results.length + 1) + ' 个动作失败：' + e.toString()); }
    finally { app.endUndoGroup(); }
  };
}());
