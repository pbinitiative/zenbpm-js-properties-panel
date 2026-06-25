import { createElement } from '@bpmn-io/properties-panel/preact';
import { useService } from 'bpmn-js-properties-panel';

/**
 * Reserved target name used by the form designer. The matching
 * `zenbpm:Input` is auto-created / auto-updated by `setupFormSaveHandler`
 * and is system-managed — the modeller should not see it in the
 * user-editable input mapping list.
 */
export const ZEN_FORM = 'ZEN_FORM';

export function ZenFormProps(element: any) {
  if (element.type !== 'bpmn:UserTask') return [];

  return [
    {
      id: 'zenFormDesignButton',
      component: ZenFormDesignButtonEntry,
      isEdited: () => false,
    },
  ];
}

function getZenFormValue(element: any): string {
  const bo = element.businessObject;
  const extensionElements = bo.extensionElements;
  if (!extensionElements) return '';

  const ioMapping = extensionElements.values?.find(
    (e: any) => e.$type === 'zenbpm:IoMapping',
  );
  if (!ioMapping) return '';

  const input = (ioMapping.inputParameters || []).find(
    (p: any) => p.target === ZEN_FORM,
  );
  if (!input?.source) return '';

  const src = input.source;
  if (src.startsWith('="') && src.endsWith('"')) {
    return src.slice(2, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return src;
}

function ZenFormDesignButtonEntry(props: any) {
  const { element } = props;
  const translate = useService('translate');

  const handleClick = () => {
    const currentValue = getZenFormValue(element);
    document.dispatchEvent(
      new CustomEvent('bpmn-open-form-designer', {
        detail: { elementId: element.id, value: currentValue },
      }),
    );
  };

  return createElement(
    'div',
    { class: 'bio-properties-panel-entry', style: 'padding: 0 10px 6px' },
    createElement(
      'button',
      {
        type: 'button',
        onClick: handleClick,
        style:
          'width: 100%; padding: 6px 12px; cursor: pointer; ' +
          'background: #4d90fe; color: white; border: none; border-radius: 3px; ' +
          'font-size: 13px; font-weight: 500;',
      },
      translate('Design Form'),
    ),
  );
}

// ─── Form variable scanning ──────────────────────────────────────────────────

function extractFormKeys(components: any[]): string[] {
  const keys: string[] = [];
  for (const comp of components || []) {
    if (comp.key) keys.push(comp.key);
    if (comp.components) keys.push(...extractFormKeys(comp.components));
    if (comp.rows) {
      for (const row of comp.rows) {
        if (Array.isArray(row)) keys.push(...extractFormKeys(row));
      }
    }
    if (comp.columns) {
      for (const col of comp.columns) {
        if (col.components) keys.push(...extractFormKeys(col.components));
      }
    }
  }
  return keys;
}

function scanFormVariables(formJson: string): string[] {
  try {
    const schema = JSON.parse(formJson);
    return extractFormKeys(schema.components || []);
  } catch {
    console.warn('[ZenBPM] Failed to parse form JSON for variable scanning');
    return [];
  }
}

/**
 * Additive, non-destructive sync: create an output for any form field
 * lacking a matching one; never delete existing (incl. manual) outputs.
 */
function syncOutputMappings(
  element: any,
  injector: any,
  variableKeys: string[],
): void {
  if (variableKeys.length === 0) return;

  const commandStack = injector.get('commandStack');
  const bpmnFactory = injector.get('bpmnFactory');

  const bo = element.businessObject;
  let extensionElements = bo.extensionElements;
  const commands: any[] = [];

  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', {
      values: [],
    });
    extensionElements.$parent = bo;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: bo,
        properties: { extensionElements },
      },
    });
  }

  let ioMapping = (extensionElements.values || []).find((e: any) =>
    e.$instanceOf('zenbpm:IoMapping'),
  );
  if (!ioMapping) {
    ioMapping = bpmnFactory.create('zenbpm:IoMapping', {
      inputParameters: [],
      outputParameters: [],
    });
    ioMapping.$parent = extensionElements;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: extensionElements,
        properties: {
          values: [...(extensionElements.values || []), ioMapping],
        },
      },
    });
  }

  const existingOutputs: any[] = ioMapping.outputParameters || [];
  const existingSources = new Set(existingOutputs.map((o: any) => o.source));

  const outputs: any[] = [...existingOutputs];
  const seenKeys = new Set<string>();
  for (const key of variableKeys) {
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const source = `=${key}`;
    if (existingSources.has(source)) continue;

    const output = bpmnFactory.create('zenbpm:Output', { source, target: key });
    output.$parent = ioMapping;
    outputs.push(output);
  }

  // Only touch the model when we actually added outputs.
  if (outputs.length > existingOutputs.length) {
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: { element, moddleElement: ioMapping, properties: { outputParameters: outputs } },
    });
  } else if (commands.length === 0) {
    return;
  }

  commandStack.execute('properties-panel.multi-command-executor', commands);
}

// ─── Form save handler ───────────────────────────────────────────────────────

const lastFormValueByElement = new Map<string, string>();

/** Test-only: reset the per-element dedup guard. Not public API. */
export function __resetFormSyncCacheForTesting(): void {
  lastFormValueByElement.clear();
}

export function setupFormSaveHandler(injector: any): void {
  const eventBus = injector.get('eventBus');

  eventBus.on(
    'commandStack.element.updateModdleProperties.executed',
    (event: any) => {
      const { context } = event;
      if (!context) return;

      const { moddleElement, properties, element } = context;

      if (!element || element.type !== 'bpmn:UserTask') return;

      // Trigger on both form-edit (Input.source updated) and form-create
      // (new ZEN_FORM Input added via IoMapping.inputParameters). Without
      // the create case the sync only fires on the second save.
      const inputUpdated =
        moddleElement?.$type === 'zenbpm:Input' &&
        moddleElement.target === ZEN_FORM &&
        properties?.source !== undefined;

      const inputCreated =
        moddleElement?.$type === 'zenbpm:IoMapping' &&
        Array.isArray(properties?.inputParameters) &&
        (properties.inputParameters as any[]).some((p: any) => p?.target === ZEN_FORM);

      if (!inputUpdated && !inputCreated) return;

      // Defer to avoid nested commandStack.execute() while stack is mid-execution
      setTimeout(() => {
        const formJson = getZenFormValue(element);
        if (!formJson) return;

        if (lastFormValueByElement.get(element.id) === formJson) return;
        lastFormValueByElement.set(element.id, formJson);

        const variableKeys = scanFormVariables(formJson);
        syncOutputMappings(element, injector, variableKeys);
      }, 0);
    },
  );
}
