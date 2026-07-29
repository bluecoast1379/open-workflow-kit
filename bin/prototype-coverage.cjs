#!/usr/bin/env node
const { flattenNodes, reasonError } = require('./prototype-core.cjs');

const SUPPORTED_PROPERTIES = {
  figma: new Set(['x', 'y', 'width', 'height', 'fill', 'stroke', 'font_size', 'font_family', 'text', 'radius', 'opacity']),
  sketch: new Set(['x', 'y', 'width', 'height', 'text']),
  axure: new Set(['x', 'y', 'width', 'height', 'text'])
};
const PROPERTY_KEYS = new Set(['x', 'y', 'width', 'height', 'fill', 'stroke', 'font_size', 'font_family', 'text', 'radius', 'opacity', 'layout', 'interaction', 'effect', 'library_link']);

function buildCoverage(model, target, mappedIds, options = {}) {
  const mapped = new Set(mappedIds || []);
  const lossById = new Map((options.entity_losses || []).map((item) => [item.source_id, item]));
  const unknownEntityIds = new Set(options.unknown_entity_ids || []);
  const entities = [
    ...model.pages.map((page) => ({ kind: 'page', source_id: page.id })),
    ...flattenNodes(model)
      .filter(({ node }) => node.type === 'text' || node.major === true || (node.requirement_ids || []).length > 0)
      .map(({ node }) => ({ kind: node.type === 'text' ? 'visible_text' : 'major_component', source_id: node.id }))
  ];
  const uniqueEntities = uniqueBy(entities, (item) => `${item.kind}:${item.source_id}`);
  const entityItems = uniqueEntities.map((entity) => {
    const categories = Number(mapped.has(entity.source_id)) + Number(lossById.has(entity.source_id)) + Number(unknownEntityIds.has(entity.source_id));
    if (categories > 1) throw reasonError('INVALID_COVERAGE', `${entity.source_id} 出现在多个 entity coverage 分类`);
    if (mapped.has(entity.source_id)) return { ...entity, status: 'mapped' };
    if (lossById.has(entity.source_id)) return { ...entity, status: 'loss', reason: lossById.get(entity.source_id).reason };
    return { ...entity, status: 'unknown', reason: 'renderer 未给出映射或 loss' };
  });

  const supported = SUPPORTED_PROPERTIES[target] || new Set();
  const injectedUnknown = new Set(options.unknown_properties || []);
  const properties = [];
  for (const { node } of flattenNodes(model)) {
    for (const key of Object.keys(node).sort()) {
      if (!PROPERTY_KEYS.has(key)) continue;
      const identity = `${node.id}:${key}`;
      if (injectedUnknown.has(identity)) properties.push({ source_id: node.id, property_path: key, status: 'unknown', reason: 'injected unknown property' });
      else if (supported.has(key)) properties.push({ source_id: node.id, property_path: key, status: 'mapped' });
      else properties.push({ source_id: node.id, property_path: key, status: 'loss', reason: `${target} v1 不映射 ${key}` });
    }
  }
  const entityCoverage = summarize(entityItems);
  const propertyCoverage = summarize(properties);
  const unknownEntities = entityItems.filter((item) => item.status === 'unknown');
  const propertyLosses = properties.filter((item) => item.status === 'loss');
  const unknownProperties = properties.filter((item) => item.status === 'unknown');
  return {
    entity_coverage: { ...entityCoverage, items: entityItems },
    property_coverage: { ...propertyCoverage, items: properties },
    entity_losses: entityItems.filter((item) => item.status === 'loss'),
    unknown_entities: unknownEntities,
    property_losses: propertyLosses,
    unknown_properties: unknownProperties,
    blocking_unknown_count: unknownEntities.length + unknownProperties.length
  };
}

function summarize(items) {
  const output = { total: items.length, mapped: 0, loss: 0, unknown: 0 };
  for (const item of items) output[item.status] += 1;
  if (output.mapped + output.loss + output.unknown !== output.total) throw reasonError('INVALID_COVERAGE', 'coverage 总数不守恒');
  return output;
}

function uniqueBy(items, selector) {
  const seen = new Set();
  return items.filter((item) => {
    const key = selector(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { buildCoverage, summarize, SUPPORTED_PROPERTIES };
