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
