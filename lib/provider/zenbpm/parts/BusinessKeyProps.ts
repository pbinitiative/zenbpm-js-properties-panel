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
import { getFeelValue } from '../../../util/FeelUtil';

const TYPE = 'zenbpm:In';
const OVERRIDE_ID = 'zenbpm-businessKey-override';
const EXPRESSION_ID = 'zenbpm-businessKey-expression';

export function getBusinessKeyInput(element: any): any {
  return getExtensionElement(element.businessObject, TYPE);
}

function OverrideBusinessKeyEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');
  const businessObject = element.businessObject;

  const getValue = () => !!getBusinessKeyInput(element);
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

  const getValue = () => getFeelValue(getBusinessKeyInput(element)?.businessKey);
  const setValue = (value: string) => {
    if (!getBusinessKeyInput(element)) {
      return;
    }
    updateExtensionElementProps(
      element,
      businessObject,
      TYPE,
      { businessKey: value },
      bpmnFactory,
      commandStack,
    );
  };

  const disabled = !getBusinessKeyInput(element);

  // FeelEntry initializes its editor's read-only state on mount. Recreate it
  // when the override changes so the editor is immediately editable/read-only.
  return createElement(FeelEntry, {
    key: disabled ? 'disabled' : 'enabled',
    element,
    id: EXPRESSION_ID,
    label: translate('Business key expression'),
    feel: 'required',
    getValue,
    setValue,
    debounce,
    disabled,
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
