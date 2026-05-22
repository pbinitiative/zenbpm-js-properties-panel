import {
  TextFieldEntry,
  FeelEntry,
  isTextFieldEntryEdited,
  isFeelEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';

const TYPE = 'zenbpm:LoopCharacteristics';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Return the bpmn:MultiInstanceLoopCharacteristics of an element, or null.
 */
function getMultiInstanceLoopCharacteristics(element: any): any {
  const lc = element.businessObject?.loopCharacteristics;
  if (!lc || !lc.$instanceOf('bpmn:MultiInstanceLoopCharacteristics')) return null;
  return lc;
}

function getZenbpmLoopCharacteristics(element: any): any {
  const lc = getMultiInstanceLoopCharacteristics(element);
  return lc ? getExtensionElement(lc, TYPE) : undefined;
}

// ─── entry components ────────────────────────────────────────────────────────

/**
 * FEEL expression — the collection to iterate over (e.g. `= items`)
 */
function InputCollectionEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const lc = getMultiInstanceLoopCharacteristics(element);

  const getValue = () => getZenbpmLoopCharacteristics(element)?.inputCollection ?? '';
  const setValue = (value: string) =>
    updateExtensionElementProps(element, lc, TYPE, { inputCollection: value }, bpmnFactory, commandStack);

  return FeelEntry({
    element,
    id: 'zenbpm-multiInstance-inputCollection',
    label: translate('Input collection'),
    feel: 'required',
    getValue,
    setValue,
    debounce,
  });
}

/**
 * Plain variable name — what each iteration element is called (e.g. `item`)
 */
function InputElementEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const lc = getMultiInstanceLoopCharacteristics(element);

  const getValue = () => getZenbpmLoopCharacteristics(element)?.inputElement ?? '';
  const setValue = (value: string) =>
    updateExtensionElementProps(element, lc, TYPE, { inputElement: value }, bpmnFactory, commandStack);

  return TextFieldEntry({
    element,
    id: 'zenbpm-multiInstance-inputElement',
    label: translate('Input element'),
    getValue,
    setValue,
    debounce,
  });
}

/**
 * Plain variable name — where to collect the results (e.g. `results`)
 */
function OutputCollectionEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const lc = getMultiInstanceLoopCharacteristics(element);

  const getValue = () => getZenbpmLoopCharacteristics(element)?.outputCollection ?? '';
  const setValue = (value: string) =>
    updateExtensionElementProps(element, lc, TYPE, { outputCollection: value }, bpmnFactory, commandStack);

  return TextFieldEntry({
    element,
    id: 'zenbpm-multiInstance-outputCollection',
    label: translate('Output collection'),
    getValue,
    setValue,
    debounce,
  });
}

/**
 * FEEL expression — the value contributed to the output collection by each iteration
 */
function OutputElementEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const lc = getMultiInstanceLoopCharacteristics(element);

  const getValue = () => getZenbpmLoopCharacteristics(element)?.outputElement ?? '';
  const setValue = (value: string) =>
    updateExtensionElementProps(element, lc, TYPE, { outputElement: value }, bpmnFactory, commandStack);

  return FeelEntry({
    element,
    id: 'zenbpm-multiInstance-outputElement',
    label: translate('Output element'),
    feel: 'required',
    getValue,
    setValue,
    debounce,
  });
}

function CompletionConditionEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const lc = getMultiInstanceLoopCharacteristics(element)!;

  const getValue = () => lc.completionCondition?.body ?? '';

  const setValue = (value: string) => {
    if (!value) {
      commandStack.execute('element.updateModdleProperties', {
        element, moddleElement: lc, properties: { completionCondition: undefined },
      });
    } else if (lc.completionCondition) {
      commandStack.execute('element.updateModdleProperties', {
        element, moddleElement: lc.completionCondition, properties: { body: value },
      });
    } else {
      const expr = bpmnFactory.create('bpmn:FormalExpression', { body: value });
      commandStack.execute('element.updateModdleProperties', {
        element, moddleElement: lc, properties: { completionCondition: expr },
      });
    }
  };

  return FeelEntry({
    element,
    id: 'zenbpm-multiInstance-completionCondition',
    label: translate('Completion condition'),
    feel: 'required',
    getValue,
    setValue,
    debounce,
  });
}

// ─── exported entry list ─────────────────────────────────────────────────────

export function MultiInstanceProps(element: any) {
  if (!getMultiInstanceLoopCharacteristics(element)) return [];

  return [
    { id: 'zenbpm-multiInstance-inputCollection',  component: InputCollectionEntry,  isEdited: isFeelEntryEdited    },
    { id: 'zenbpm-multiInstance-inputElement',     component: InputElementEntry,     isEdited: isTextFieldEntryEdited },
    { id: 'zenbpm-multiInstance-outputCollection', component: OutputCollectionEntry, isEdited: isTextFieldEntryEdited },
    { id: 'zenbpm-multiInstance-outputElement',    component: OutputElementEntry,    isEdited: isFeelEntryEdited    },
    { id: 'zenbpm-multiInstance-completionCondition', component: CompletionConditionEntry, isEdited: isFeelEntryEdited },
  ];
}
