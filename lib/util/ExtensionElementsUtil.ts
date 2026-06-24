/**
 * Return the first extension element of `type` from the given business object,
 * or undefined if none exists.
 */
export function getExtensionElement(bo: any, type: string): any {
  const ext = bo.extensionElements;
  if (!ext) return undefined;
  return (ext.values || []).find((e: any) => e.$instanceOf(type));
}

/**
 * Update properties on an existing extension element, or create a new one
 * inside bpmn:ExtensionElements if it does not yet exist.
 *
 * Uses `properties-panel.multi-command-executor` so all mutations land as
 * a single undo-able step.
 */
export function updateExtensionElementProps(
  element: any,
  bo: any,
  type: string,
  props: Record<string, any>,
  bpmnFactory: any,
  commandStack: any,
): void {
  const commands: any[] = [];
  let extensionElements = bo.extensionElements;

  // (1) create bpmn:ExtensionElements container if missing
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = bo;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: { element, moddleElement: bo, properties: { extensionElements } },
    });
  }

  const existing = (extensionElements.values || []).find((e: any) => e.$instanceOf(type));

  if (existing) {
    // (2a) update properties on the existing element
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: { element, moddleElement: existing, properties: props },
    });
  } else {
    // (2b) create and attach a new extension element
    const created = bpmnFactory.create(type, props);
    created.$parent = extensionElements;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: extensionElements,
        properties: { values: [...(extensionElements.values || []), created] },
      },
    });
  }

  commandStack.execute('properties-panel.multi-command-executor', commands);
}

/**
 * Remove all extension elements of `type` from `bo`. No-op if none exist.
 * Executes a single undoable command.
 */
export function removeExtensionElement(
  element: any,
  bo: any,
  type: string,
  commandStack: any,
): void {
  const extensionElements = bo.extensionElements;
  if (!extensionElements) return;
  const matching = (extensionElements.values || []).filter((e: any) => e.$instanceOf(type));
  if (!matching.length) return;

  const remainingValues = (extensionElements.values || []).filter((e: any) => !e.$instanceOf(type));
  if (remainingValues.length === 0) {
    // Removing the last value would leave an empty <bpmn:extensionElements>
    // container (dirty XML). Drop the container from the parent instead —
    // mirrors the handling in `removeParam` (IoMappingProps.ts).
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: bo,
      properties: { extensionElements: undefined },
    });
  } else {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: extensionElements,
      properties: { values: remainingValues },
    });
  }
}

/**
 * Atomically swap extension elements: remove all instances of `removeType` and
 * ensure exactly one instance of `createType` exists.  Both changes land as a
 * single undoable step via `properties-panel.multi-command-executor`.
 *
 * Used when toggling mutually-exclusive extension elements (e.g. switching a
 * BusinessRuleTask between a CalledDecision and a TaskDefinition).
 */
export function switchExtensionElement(
  element: any,
  bo: any,
  removeType: string,
  createType: string,
  bpmnFactory: any,
  commandStack: any,
): void {
  const commands: any[] = [];

  let extensionElements = bo.extensionElements;

  // (1) create bpmn:ExtensionElements container if missing
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = bo;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: { element, moddleElement: bo, properties: { extensionElements } },
    });
  }

  const currentValues: any[] = extensionElements.values || [];
  const hasRemoveType = currentValues.some((e: any) => e.$instanceOf(removeType));
  const hasCreateType = currentValues.some((e: any) => e.$instanceOf(createType));

  // Already in the desired state — nothing to do
  if (!hasRemoveType && hasCreateType) return;

  let newValues = currentValues.filter((e: any) => !e.$instanceOf(removeType));

  if (!hasCreateType) {
    const created = bpmnFactory.create(createType, {});
    created.$parent = extensionElements;
    newValues = [...newValues, created];
  }

  commands.push({
    cmd: 'element.updateModdleProperties',
    context: { element, moddleElement: extensionElements, properties: { values: newValues } },
  });

  commandStack.execute('properties-panel.multi-command-executor', commands);
}
