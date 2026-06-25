import {
  TextFieldEntry,
  FeelEntry,
  ListGroup,
  isTextFieldEntryEdited,
  isFeelEntryEdited
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement } from '../../../util/ExtensionElementsUtil';
import { getFeelValue } from '../../../util/FeelUtil';
import { ZEN_FORM } from './ZenFormProps';

const IO_ELEMENTS = new Set([
  'bpmn:ServiceTask', 'bpmn:BusinessRuleTask', 'bpmn:SendTask', 'bpmn:ScriptTask',
  'bpmn:UserTask', 'bpmn:SubProcess', 'bpmn:CallActivity',
  'bpmn:EndEvent', 'bpmn:IntermediateCatchEvent', 'bpmn:IntermediateThrowEvent',
]);

const OUTPUT_ONLY_ELEMENTS = new Set([
  'bpmn:StartEvent',
  'bpmn:BoundaryEvent',
]);

/**
 * Input mapping targets that are system-managed and must not appear in the
 * modeller-facing input mapping list. The underlying `zenbpm:Input` is left
 * untouched in the model — it is only hidden from the rendered UI.
 */
const HIDDEN_INPUT_TARGETS: ReadonlySet<string> = new Set([]);

export function supportsInputMapping(element: any): boolean {
  return IO_ELEMENTS.has(element.type);
}

export function supportsOutputMapping(element: any): boolean {
  return IO_ELEMENTS.has(element.type) || OUTPUT_ONLY_ELEMENTS.has(element.type);
}

// `ParamEntry` is defined at module scope so its function reference never
// changes. See the matching comment in `ExtensionPropertiesProps.ts` — the
// previous `makeParamEntry` factory returned a new function on every render,
// which made Preact remount the input ~600ms after the user started typing
// and dropped keyboard focus.
function ParamEntry(props: any) {
  const { element: bpmnElement, param, prop, id, labelKey } = props;

  const commandStack = useService('commandStack');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () =>
    prop === 'source' ? getFeelValue((param as any)[prop]) : ((param as any)[prop] || '');
  const setValue = (value: string) =>
    commandStack.execute('element.updateModdleProperties', {
      element: bpmnElement,
      moddleElement: param,
      properties: { [prop]: value },
    });

  const label = translate(labelKey);

  return prop === 'source'
    ? FeelEntry({ element: bpmnElement, id, label, feel: 'required', getValue, setValue, debounce })
    : TextFieldEntry({ element: bpmnElement, id, label, getValue, setValue, debounce });
}

function addParam(
  element: any, bo: any, bpmnFactory: any, commandStack: any,
  paramType: 'zenbpm:Input' | 'zenbpm:Output',
  listProp: 'inputParameters' | 'outputParameters',
) {
  const commands: any[] = [];
  let extensionElements = bo.extensionElements;

  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = bo;
    commands.push({ cmd: 'element.updateModdleProperties', context: { element, moddleElement: bo, properties: { extensionElements } } });
  }

  let ioMapping = (extensionElements.values || []).find((e: any) => e.$instanceOf('zenbpm:IoMapping'));
  if (!ioMapping) {
    ioMapping = bpmnFactory.create('zenbpm:IoMapping', { inputParameters: [], outputParameters: [] });
    ioMapping.$parent = extensionElements;
    commands.push({ cmd: 'element.updateModdleProperties', context: { element, moddleElement: extensionElements, properties: { values: [...(extensionElements.values || []), ioMapping] } } });
  }

  const newParam = bpmnFactory.create(paramType, { source: '', target: '' });
  newParam.$parent = ioMapping;
  commands.push({ cmd: 'element.updateModdleProperties', context: { element, moddleElement: ioMapping, properties: { [listProp]: [...(ioMapping[listProp] || []), newParam] } } });

  commandStack.execute('properties-panel.multi-command-executor', commands);
}

function removeParam(
  element: any, ioMapping: any, param: any,
  listProp: 'inputParameters' | 'outputParameters',
  commandStack: any,
) {
  const remaining = (ioMapping[listProp] || []).filter((p: any) => p !== param);
  const otherProp: 'inputParameters' | 'outputParameters' =
    listProp === 'inputParameters' ? 'outputParameters' : 'inputParameters';
  const otherRemaining = ioMapping[otherProp] || [];

  if (remaining.length > 0 || otherRemaining.length > 0) {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: ioMapping,
      properties: { [listProp]: remaining },
    });
    return;
  }

  const extensionElements = element.businessObject.extensionElements;
  const newValues = (extensionElements.values || []).filter((e: any) => e !== ioMapping);

  if (newValues.length === 0) {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: element.businessObject,
      properties: { extensionElements: undefined },
    });
  } else {
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: extensionElements,
      properties: { values: newValues },
    });
  }
}

export function createInputMappingGroup(element: any, injector: any): any | null {
  if (!supportsInputMapping(element)) return null;

  const commandStack = injector.get('commandStack');
  const bpmnFactory = injector.get('bpmnFactory');
  const translate = injector.get('translate');
  const eventBus = injector.get('eventBus');

  const bo = element.businessObject;
  const ioMapping = getExtensionElement(bo, 'zenbpm:IoMapping');
  const inputs: any[] = ioMapping?.inputParameters || [];

  // Hide system-managed targets (e.g. ZEN_FORM) from the modeller-facing
  // list. The underlying `zenbpm:Input` is left in the model so form data
  // round-trips; only the rendered row is suppressed. We keep the original
  // underlying index in the item id so the `add` callback's `inputs.length`
  // computation stays consistent with the position new params get appended at.
  const items = inputs
    .map((input: any, index: number) => {
      if (HIDDEN_INPUT_TARGETS.has(input.target)) {
        return null;
      }
      const id = `${element.id}-zenbpm-input-${index}`;
      return {
        id,
        label: input.target || translate('<empty>'),
        entries: [
          {
            id: `${id}-source`,
            component: ParamEntry,
            isEdited: isFeelEntryEdited,
            // extras consumed by `ParamEntry` (spread into props by CollapsibleEntry):
            param: input,
            prop: 'source',
            labelKey: 'Source expression',
          },
          {
            id: `${id}-target`,
            component: ParamEntry,
            isEdited: isTextFieldEntryEdited,
            param: input,
            prop: 'target',
            labelKey: 'Target variable',
          },
        ],
        autoFocusEntry: `${id}-target`,
        remove: () => removeParam(element, ioMapping, input, 'inputParameters', commandStack),
      };
    })
    .filter((item: any) => item !== null);

  return {
    id: 'zenbpm-ioMapping-inputs',
    label: translate('Input mapping'),
    component: ListGroup,
    items,
    add: () => {
      addParam(element, bo, bpmnFactory, commandStack, 'zenbpm:Input', 'inputParameters');
      const newId = `${element.id}-zenbpm-input-${inputs.length}`;
      setTimeout(() => eventBus.fire('propertiesPanel.showEntry', { id: `${newId}-target` }), 0);
    },
  };
}

export function createOutputMappingGroup(element: any, injector: any): any | null {
  if (!supportsOutputMapping(element)) return null;

  const commandStack = injector.get('commandStack');
  const bpmnFactory = injector.get('bpmnFactory');
  const translate = injector.get('translate');
  const eventBus = injector.get('eventBus');

  const bo = element.businessObject;
  const ioMapping = getExtensionElement(bo, 'zenbpm:IoMapping');
  const outputs: any[] = ioMapping?.outputParameters || [];

  const items = outputs.map((output: any, index: number) => {
    const id = `${element.id}-zenbpm-output-${index}`;
    return {
      id,
      label: output.target || translate('<empty>'),
      entries: [
        {
          id: `${id}-source`,
          component: ParamEntry,
          isEdited: isFeelEntryEdited,
          param: output,
          prop: 'source',
          labelKey: 'Source expression',
        },
        {
          id: `${id}-target`,
          component: ParamEntry,
          isEdited: isTextFieldEntryEdited,
          param: output,
          prop: 'target',
          labelKey: 'Target variable',
        },
      ],
      autoFocusEntry: `${id}-target`,
      remove: () => removeParam(element, ioMapping, output, 'outputParameters', commandStack),
    };
  });

  return {
    id: 'zenbpm-ioMapping-outputs',
    label: translate('Output mapping'),
    component: ListGroup,
    items,
    add: () => {
      addParam(element, bo, bpmnFactory, commandStack, 'zenbpm:Output', 'outputParameters');
      const newId = `${element.id}-zenbpm-output-${outputs.length}`;
      setTimeout(() => eventBus.fire('propertiesPanel.showEntry', { id: `${newId}-target` }), 0);
    },
  };
}
