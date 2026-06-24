import {
  TextFieldEntry,
  TextAreaEntry,
  ListGroup,
  isTextFieldEntryEdited,
  isTextAreaEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, removeExtensionElement } from '../../../util/ExtensionElementsUtil';
import { isModelerPropertyName, validateJson } from '../../../util/ValidationUtil';
import { isExampleDataPropertyName } from './ExampleDataProps';

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

// ─── per-row component (stable identity across re-renders) ──────────────────
//
// `PropertyEntry` is defined at module scope so its function reference never
// changes. The bpmn-io properties-panel re-renders the whole group on every
// `elements.changed` event (fired by the debounced commit ~600ms after the
// user stops typing), and Preact's keyed reconciler unmounts/remounts a row
// whose `type` changed — which previously made the input lose focus while
// typing. An earlier version of this code used a `makePropertyEntry` factory
// that returned a brand-new function on every render, causing exactly that
// remount. Routing the moddle element and the edited field through the
// entry descriptor (which `CollapsibleEntry` spreads into the component's
// props) keeps the component identity stable and preserves focus.

function PropertyEntry(props: any) {
  const { element: bpmnElement, property, field, id } = props;

  const commandStack = useService('commandStack');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const getValue = () => (property.get(field) || '');
  const setValue = (value: string) =>
    commandStack.execute('element.updateModdleProperties', {
      element: bpmnElement,
      moddleElement: property,
      properties: { [field]: value },
    });

  const label = translate(field === 'name' ? 'Name' : 'Value');

  // For the value of a `*Modeler:*` property we switch to a multi-line
  // textarea and JSON-validate the input. The name field stays a single-line
  // text input — names are short identifiers, not JSON blobs.
  if (field === 'value' && isModelerPropertyName(property.get('name'))) {
    return TextAreaEntry({
      element: property,
      id,
      label,
      getValue,
      setValue,
      debounce,
      isEdited: isTextAreaEntryEdited,
      validate: validateJson,
    });
  }

  return TextFieldEntry({
    element: property,
    id,
    label,
    getValue,
    setValue,
    debounce,
    isEdited: isTextFieldEntryEdited,
  });
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
    // last one removed → drop the whole `zenbpm:Properties` container too.
    // `removeExtensionElement` also removes an now-empty <bpmn:ExtensionElements>
    // container, which the previous inline filter would have left behind as dirty XML.
    removeExtensionElement(element, element.businessObject, TYPE_PROPERTIES, commandStack);
  }
}

// ─── exported group factory ──────────────────────────────────────────────────

export function ExtensionPropertiesGroup(element: any, injector: any): any | null {
  const commandStack = injector.get('commandStack');
  const bpmnFactory  = injector.get('bpmnFactory');
  const translate    = injector.get('translate');
  const eventBus     = injector.get('eventBus');

  const list: any[] = getPropertiesList(element);

  // Example-data properties (e.g. `zenbpmModeler:exampleOutputJson`) are
  // surfaced in the dedicated "Example data" group instead, so they must
  // not appear here.
  const visibleList = list.filter((p: any) => !isExampleDataPropertyName(p.get('name')));

  // Hide example-data properties from this list but keep the underlying
  // (unfiltered) index in the item id, so the `add` callback's `list.length`
  // computation stays consistent with the position new properties get appended
  // at — see IoMappingProps.ts for the same pattern.
  const items = visibleList.map((property: any) => {
    const index = list.indexOf(property);
    const id = `${element.id}-zenbpm-extensionProperty-${index}`;
    return {
      id,
      label: property.get('name') || translate('<empty>'),
      entries: [
        {
          id: `${id}-name`,
          component: PropertyEntry,
          isEdited: isTextFieldEntryEdited,
          // extras consumed by `PropertyEntry` (spread into props by CollapsibleEntry):
          property,
          field: 'name',
        },
        {
          id: `${id}-value`,
          component: PropertyEntry,
          isEdited: isTextFieldEntryEdited,
          property,
          field: 'value',
        },
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
