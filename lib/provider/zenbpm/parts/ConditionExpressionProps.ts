import { FeelEntry, isFeelEntryEdited } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';

function ConditionExpressionEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => bo.conditionExpression?.body ?? '';

  const setValue = (value: string) => {
    if (!value) {
      commandStack.execute('element.updateModdleProperties', {
        element, moddleElement: bo, properties: { conditionExpression: undefined },
      });
    } else if (bo.conditionExpression) {
      commandStack.execute('element.updateModdleProperties', {
        element, moddleElement: bo.conditionExpression, properties: { body: value },
      });
    } else {
      const expr = bpmnFactory.create('bpmn:FormalExpression', { body: value });
      commandStack.execute('element.updateModdleProperties', {
        element, moddleElement: bo, properties: { conditionExpression: expr },
      });
    }
  };

  return FeelEntry({
    element,
    id: 'zenbpm-conditionExpression',
    label: translate('Condition expression'),
    feel: 'required',
    getValue,
    setValue,
    debounce,
  });
}

export function ConditionExpressionProps(element: any) {
  if (element.type !== 'bpmn:SequenceFlow') return [];

  return [
    { id: 'zenbpm-conditionExpression', component: ConditionExpressionEntry, isEdited: isFeelEntryEdited },
  ];
}
