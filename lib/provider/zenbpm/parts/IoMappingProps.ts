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

const IO_ELEMENTS = new Set([
  'bpmn:ServiceTask', 'bpmn:BusinessRuleTask', 'bpmn:SendTask', 'bpmn:ScriptTask',
  'bpmn:UserTask', 'bpmn:SubProcess', 'bpmn:CallActivity',
  'bpmn:EndEvent', 'bpmn:IntermediateCatchEvent', 'bpmn:IntermediateThrowEvent',
]);

const OUTPUT_ONLY_ELEMENTS = new Set([
  'bpmn:StartEvent',
  'bpmn:BoundaryEvent',
]);

export function supportsInputMapping(element: any): boolean {
  return IO_ELEMENTS.has(element.type);
}

export function supportsOutputMapping(element: any): boolean {
  return IO_ELEMENTS.has(element.type) || OUTPUT_ONLY_ELEMENTS.has(element.type);
}

function makeParamEntry(id: string, labelKey: string, prop: 'source' | 'target', element: any, param: any) {
  return function ParamEntry(_props: any) {
    const commandStack = useService('commandStack');
    const translate    = useService('translate');
    const debounce     = useService('debounceInput');

    const getValue = () =>
      prop === 'source' ? getFeelValue((param as any)[prop]) : ((param as any)[prop] || '');
    const setValue = (value: string) =>
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: param,
        properties: { [prop]: value },
      });

    return prop === 'source'
      ? FeelEntry({ element, id, label: translate(labelKey), feel: 'required', getValue, setValue, debounce })
      : TextFieldEntry({ element, id, label: translate(labelKey), getValue, setValue, debounce });
  };
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
  commandStack.execute('element.updateModdleProperties', {
    element,
    moddleElement: ioMapping,
    properties: { [listProp]: (ioMapping[listProp] || []).filter((p: any) => p !== param) },
  });
}

export function createInputMappingGroup(element: any, injector: any): any | null {
  if (!supportsInputMapping(element)) return null;

  const commandStack = injector.get('commandStack');
  const bpmnFactory  = injector.get('bpmnFactory');
  const translate    = injector.get('translate');

  const bo        = element.businessObject;
  const ioMapping  = getExtensionElement(bo, 'zenbpm:IoMapping');
  const inputs: any[] = ioMapping?.inputParameters || [];

  const items = inputs.map((input: any, index: number) => {
    const id = `${element.id}-zenbpm-input-${index}`;
    return {
      id,
      label: input.target || translate('<empty>'),
      entries: [
        { id: `${id}-source`, component: makeParamEntry(`${id}-source`, 'Source expression', 'source', element, input), isEdited: isFeelEntryEdited },
        { id: `${id}-target`, component: makeParamEntry(`${id}-target`, 'Target variable',   'target', element, input), isEdited: isTextFieldEntryEdited },
      ],
      autoFocusEntry: `${id}-target`,
      remove: () => removeParam(element, ioMapping, input, 'inputParameters', commandStack),
    };
  });

  return {
    id: 'zenbpm-ioMapping-inputs',
    label: translate('Input mapping'),
    component: ListGroup,
    items,
    add: () => addParam(element, bo, bpmnFactory, commandStack, 'zenbpm:Input', 'inputParameters'),
  };
}

export function createOutputMappingGroup(element: any, injector: any): any | null {
  if (!supportsOutputMapping(element)) return null;

  const commandStack = injector.get('commandStack');
  const bpmnFactory  = injector.get('bpmnFactory');
  const translate    = injector.get('translate');

  const bo        = element.businessObject;
  const ioMapping  = getExtensionElement(bo, 'zenbpm:IoMapping');
  const outputs: any[] = ioMapping?.outputParameters || [];

  const items = outputs.map((output: any, index: number) => {
    const id = `${element.id}-zenbpm-output-${index}`;
    return {
      id,
      label: output.target || translate('<empty>'),
      entries: [
        { id: `${id}-source`, component: makeParamEntry(`${id}-source`, 'Source expression', 'source', element, output), isEdited: isFeelEntryEdited },
        { id: `${id}-target`, component: makeParamEntry(`${id}-target`, 'Target variable',   'target', element, output), isEdited: isTextFieldEntryEdited },
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
    add: () => addParam(element, bo, bpmnFactory, commandStack, 'zenbpm:Output', 'outputParameters'),
  };
}
