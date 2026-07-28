import {
  CheckboxEntry,
  FeelEntry,
  isCheckboxEntryEdited,
  isFeelEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { createElement } from '@bpmn-io/properties-panel/preact';
import {
  getExtensionElement,
  removeExtensionElement,
  updateExtensionElementProps,
} from '../../../util/ExtensionElementsUtil';

const TYPE = 'zenbpm:In';
const OVERRIDE_ID = 'zenbpm-businessKey-override';
const EXPRESSION_ID = 'zenbpm-businessKey-expression';

export function getBusinessKeyInput(element: any): any {
  return getExtensionElement(element.businessObject, TYPE);
}

function hasBusinessKeyOverride(element: any): boolean {
  return getBusinessKeyInput(element)?.businessKey !== undefined;
}

function OverrideBusinessKeyEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');
  const businessObject = element.businessObject;

  const getValue = () => hasBusinessKeyOverride(element);
  const setValue = (value: boolean) => {
    if (value) {
      updateExtensionElementProps(
        element,
        businessObject,
        TYPE,
        { businessKey: '' },
        bpmnFactory,
        commandStack,
      );
    } else {
      removeExtensionElement(element, businessObject, TYPE, commandStack);
    }
  };

  return CheckboxEntry({
    element,
    id: OVERRIDE_ID,
    label: translate('Override business key'),
    getValue,
    setValue,
  });
}

function BusinessKeyExpressionEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');
  const debounce = useService('debounceInput');
  const businessObject = element.businessObject;

  if (!hasBusinessKeyOverride(element)) {
    return null;
  }

  const getValue = () => getBusinessKeyInput(element)?.businessKey ?? '';
  const setValue = (value: string | undefined) => {
    if (!hasBusinessKeyOverride(element)) {
      return;
    }
    updateExtensionElementProps(
      element,
      businessObject,
      TYPE,
      { businessKey: value ?? '' },
      bpmnFactory,
      commandStack,
    );
  };

  return createElement(FeelEntry, {
    element,
    id: EXPRESSION_ID,
    label: translate('Business key expression'),
    description: translate('Non-empty business keys use FEEL and must start with "=". Invalid expressions or non-string results create an incident.'),
    feel: 'required',
    getValue,
    setValue,
    debounce,
  });
}

export function BusinessKeyProps(element: any) {
  return [
    {
      id: OVERRIDE_ID,
      component: OverrideBusinessKeyEntry,
      isEdited: isCheckboxEntryEdited,
    },
    {
      id: EXPRESSION_ID,
      component: BusinessKeyExpressionEntry,
      isEdited: isFeelEntryEdited,
    },
  ];
}
