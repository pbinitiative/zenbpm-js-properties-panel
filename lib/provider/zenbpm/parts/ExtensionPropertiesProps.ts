import {
  TextFieldEntry,
  ListGroup,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement } from '../../../util/ExtensionElementsUtil';

const TYPE_PROPERTIES = 'zenbpm:Properties';
const TYPE_PROPERTY = 'zenbpm:Property';

// ─── accessors ───────────────────────────────────────────────────────────────

export function getProperties(element: any): any {
  return getExtensionElement(element.businessObject, TYPE_PROPERTIES);
}

export function getPropertiesList(element: any): any[] {
  const properties = getProperties(element);
  return properties ? (properties.get('properties') || []) : [];
}

// ─── item entry factory (one component per item) ────────────────────────────

function makePropertyEntry(id: string, element: any, property: any, field: 'name' | 'value') {
  return function PropertyEntry(_props: any) {
    const commandStack = useService('commandStack');
    const translate    = useService('translate');
    const debounce     = useService('debounceInput');

    const getValue = () => (property.get(field) || '');
    const setValue = (value: string) =>
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: property,
        properties: { [field]: value },
      });

    return TextFieldEntry({
      element: property,
      id,
      label: translate(field === 'name' ? 'Name' : 'Value'),
      getValue,
      setValue,
      debounce,
    });
  };
}

// ─── add / remove ────────────────────────────────────────────────────────────

function addProperty(element: any, bpmnFactory: any, commandStack: any, eventBus: any, currentCount: number) {
  const bo = element.businessObject;
  const commands: any[] = [];

  let extensionElements = bo.extensionElements;

  // (1) ensure bpmn:ExtensionElements
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = bo;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: { element, moddleElement: bo, properties: { extensionElements } },
    });
  }

  // (2) ensure zenbpm:Properties container (re-use if present)
  let properties = (extensionElements.values || []).find((e: any) => e.$instanceOf(TYPE_PROPERTIES));
  if (!properties) {
    properties = bpmnFactory.create(TYPE_PROPERTIES, { properties: [] });
    properties.$parent = extensionElements;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: extensionElements,
        properties: { values: [...(extensionElements.values || []), properties] },
      },
    });
  }

  // (3) create the new zenbpm:Property and append it to the container's `properties` list
  const created = bpmnFactory.create(TYPE_PROPERTY, { name: '', value: '' });
  created.$parent = properties;
  commands.push({
    cmd: 'element.updateModdleProperties',
    context: {
      element,
      moddleElement: properties,
      properties: { properties: [...(properties.get('properties') || []), created] },
    },
  });

  commandStack.execute('properties-panel.multi-command-executor', commands);

  const newId = `${element.id}-zenbpm-extensionProperty-${currentCount}`;
  setTimeout(() => eventBus.fire('propertiesPanel.showEntry', { id: `${newId}-name` }), 0);
}

function removeProperty(element: any, property: any, commandStack: any) {
  const properties = getProperties(element);
  if (!properties) return;

  const remaining = (properties.get('properties') || []).filter((p: any) => p !== property);

  if (remaining.length) {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: properties,
      properties: { properties: remaining },
    });
  } else {
    // last one removed → drop the whole `zenbpm:Properties` container too
    const extensionElements = element.businessObject.extensionElements;
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: extensionElements,
      properties: {
        values: (extensionElements.values || []).filter((e: any) => !e.$instanceOf(TYPE_PROPERTIES)),
      },
    });
  }
}

// ─── exported group factory ──────────────────────────────────────────────────

export function ExtensionPropertiesGroup(element: any, injector: any): any | null {
  const commandStack = injector.get('commandStack');
  const bpmnFactory  = injector.get('bpmnFactory');
  const translate    = injector.get('translate');
  const eventBus     = injector.get('eventBus');

  const list: any[] = getPropertiesList(element);

  const items = list.map((property: any, index: number) => {
    const id = `${element.id}-zenbpm-extensionProperty-${index}`;
    return {
      id,
      label: property.get('name') || translate('<empty>'),
      entries: [
        { id: `${id}-name`,  component: makePropertyEntry(`${id}-name`,  element, property, 'name'),  isEdited: isTextFieldEntryEdited },
        { id: `${id}-value`, component: makePropertyEntry(`${id}-value`, element, property, 'value'), isEdited: isTextFieldEntryEdited },
      ],
      autoFocusEntry: `${id}-name`,
      remove: () => removeProperty(element, property, commandStack),
    };
  });

  return {
    id: 'zenbpm-extensionProperties',
    label: translate('Extension properties'),
    component: ListGroup,
    items,
    add: () => addProperty(element, bpmnFactory, commandStack, eventBus, list.length),
  };
}
