import {
  TextAreaEntry,
  isTextAreaEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';

import { getExtensionElement } from '../../../util/ExtensionElementsUtil';
import { validateJson } from '../../../util/ValidationUtil';

const TYPE_PROPERTIES = 'zenbpm:Properties';
const TYPE_PROPERTY = 'zenbpm:Property';
const MODELER_PREFIX = 'zenbpmModeler:';

interface ExampleDataProperty {
  /**
   * Local property name (without the `<vendor>Modeler:` prefix).
   * The full moddle name is constructed as `${MODELER_PREFIX}${propertyName}`.
   */
  propertyName: string;
  /** User-facing label in the properties panel. */
  label: string;
}

/**
 * Known example-data properties lifted out of the generic
 * "Extension properties" list and exposed as dedicated, JSON-validated
 * entries in the "Example data" group.
 *
 * Each entry is always rendered (even if the moddle property is absent) so
 * the modeller can both inspect existing data and add new data by typing
 * a value. Clearing the field removes the moddle property.
 */
const EXAMPLE_DATA_PROPERTIES: readonly ExampleDataProperty[] = [
  { propertyName: 'exampleOutputJson', label: 'Example output' },
];

/**
 * Returns `true` if `name` (a moddle `zenbpm:Property.name` value) is a
 * known example-data property. Used by `ExtensionPropertiesGroup` to hide
 * these properties from the generic Extension properties list.
 */
export function isExampleDataPropertyName(name: string | null | undefined): boolean {
  if (!name) return false;
  const colonIdx = name.indexOf(':');
  if (colonIdx < 0) return false;
  const localName = name.slice(colonIdx + 1);
  return EXAMPLE_DATA_PROPERTIES.some((p) => p.propertyName === localName);
}

// ─── moddle accessors / mutators ────────────────────────────────────────────

function findModelerProperty(element: any, propertyName: string): any | null {
  const fullName = MODELER_PREFIX + propertyName;
  const container = getExtensionElement(element.businessObject, TYPE_PROPERTIES);
  if (!container) return null;
  return (container.get('properties') || []).find((p: any) => p.get('name') === fullName) || null;
}

function upsertModelerProperty(
  element: any,
  bpmnFactory: any,
  commandStack: any,
  propertyName: string,
  value: string,
): void {
  const bo = element.businessObject;
  const commands: any[] = [];

  // (1) ensure bpmn:ExtensionElements exists
  let extensionElements = bo.extensionElements;
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = bo;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: { element, moddleElement: bo, properties: { extensionElements } },
    });
  }

  // (2) ensure zenbpm:Properties container exists
  let container = (extensionElements.values || []).find((e: any) => e.$instanceOf(TYPE_PROPERTIES));
  if (!container) {
    container = bpmnFactory.create(TYPE_PROPERTIES, { properties: [] });
    container.$parent = extensionElements;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: extensionElements,
        properties: { values: [...(extensionElements.values || []), container] },
      },
    });
  }

  // (3) update existing or create new
  const fullName = MODELER_PREFIX + propertyName;
  const existing = (container.get('properties') || []).find((p: any) => p.get('name') === fullName);
  if (existing) {
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: { element, moddleElement: existing, properties: { value } },
    });
  } else {
    const created = bpmnFactory.create(TYPE_PROPERTY, { name: fullName, value });
    created.$parent = container;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: container,
        properties: { properties: [...(container.get('properties') || []), created] },
      },
    });
  }

  commandStack.execute('properties-panel.multi-command-executor', commands);
}

function clearModelerProperty(element: any, commandStack: any, propertyName: string): void {
  const bo = element.businessObject;
  const extensionElements = bo.extensionElements;
  if (!extensionElements) return;

  const container = (extensionElements.values || []).find((e: any) => e.$instanceOf(TYPE_PROPERTIES));
  if (!container) return;

  const fullName = MODELER_PREFIX + propertyName;
  const existing = (container.get('properties') || []).find((p: any) => p.get('name') === fullName);
  if (!existing) return;

  const remaining = (container.get('properties') || []).filter((p: any) => p !== existing);

  if (remaining.length) {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: container,
      properties: { properties: remaining },
    });
    return;
  }

  // last one — drop the whole `zenbpm:Properties` container
  commandStack.execute('element.updateModdleProperties', {
    element,
    moddleElement: extensionElements,
    properties: {
      values: (extensionElements.values || []).filter((e: any) => !e.$instanceOf(TYPE_PROPERTIES)),
    },
  });
}

// ─── per-row component (stable identity across re-renders) ─────────────────

function ExampleDataEntry(props: any) {
  const { element, propertyName, id } = props;

  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const moddleProperty = findModelerProperty(element, propertyName);
  const currentLabel = (EXAMPLE_DATA_PROPERTIES.find((p) => p.propertyName === propertyName) || {}).label || propertyName;

  const getValue = () => (moddleProperty ? (moddleProperty.get('value') || '') : '');

  const setValue = (value: string) => {
    if (value && value.trim() !== '') {
      upsertModelerProperty(element, bpmnFactory, commandStack, propertyName, value);
    } else if (moddleProperty) {
      clearModelerProperty(element, commandStack, propertyName);
    }
  };

  return TextAreaEntry({
    element,
    id,
    label: translate(currentLabel),
    getValue,
    setValue,
    debounce,
    isEdited: isTextAreaEntryEdited,
    validate: validateJson,
  });
}

// ─── entry descriptor factory (consumed by the provider's Group) ───────────

export function ExampleDataProps(element: any): any[] {
  if (!element || !element.businessObject) return [];

  return EXAMPLE_DATA_PROPERTIES.map(({ propertyName }) => ({
    id: `zenbpm-exampleData-${propertyName}`,
    component: ExampleDataEntry,
    isEdited: isTextAreaEntryEdited,
    // extras consumed by `ExampleDataEntry` (spread into props by CollapsibleEntry):
    element,
    propertyName,
  }));
}
