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
 * Answer the `bpmn:ExtensionElements` of `bo`. When it is missing, push the
 * command creating it onto `commands` for one
 * `properties-panel.multi-command-executor` step, and answer the new one,
 * which a later command of the same step can update.
 */
export function ensureExtensionElements(element: any, bo: any, bpmnFactory: any, commands: any[]): any {
  if (bo.extensionElements) return bo.extensionElements;

  const extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
  extensionElements.$parent = bo;
  commands.push({
    cmd: 'element.updateModdleProperties',
    context: { element, moddleElement: bo, properties: { extensionElements } },
  });
  return extensionElements;
}

/**
 * Answer the extension element of `type` of `bo`. When it is missing, push
 * the commands creating it with `props`, and `bpmn:ExtensionElements` too
 * where that is missing, onto `commands` for one
 * `properties-panel.multi-command-executor` step, and answer the new element,
 * which a later command of the same step can update.
 */
export function ensureExtensionElement(
  element: any,
  bo: any,
  type: string,
  bpmnFactory: any,
  commands: any[],
  props: Record<string, any> = {},
): any {
  const extensionElements = ensureExtensionElements(element, bo, bpmnFactory, commands);

  const existing = (extensionElements.values || []).find((e: any) => e.$instanceOf(type));
  if (existing) return existing;

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
  return created;
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
  const existing = getExtensionElement(bo, type);

  if (existing) {
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: { element, moddleElement: existing, properties: props },
    });
  } else {
    ensureExtensionElement(element, bo, type, bpmnFactory, commands, props);
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

  keepExtensionValues(
    element, bo, (extensionElements.values || []).filter((e: any) => !e.$instanceOf(type)), commandStack,
  );
}

/**
 * Remove one extension element of `bo` and leave every other one, those of
 * its own type included. No-op if `bo` does not carry it. Executes a single
 * undoable command.
 */
export function removeExtensionValue(element: any, bo: any, value: any, commandStack: any): void {
  const values: any[] = bo.extensionElements?.values || [];
  if (!values.includes(value)) return;

  keepExtensionValues(element, bo, values.filter((other: any) => other !== value), commandStack);
}

function keepExtensionValues(element: any, bo: any, remainingValues: any[], commandStack: any): void {
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
      moddleElement: bo.extensionElements,
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

  const extensionElements = ensureExtensionElements(element, bo, bpmnFactory, commands);

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
