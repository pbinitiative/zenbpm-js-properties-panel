import { FeelEntry, isFeelEntryEdited } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getFormalExpressionValue, setFormalExpression } from '../../../util/FeelUtil';

function ConditionExpressionEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => getFormalExpressionValue(bo.conditionExpression);

  const setValue = (value: string) =>
    setFormalExpression(element, bo, 'conditionExpression', value, bpmnFactory, commandStack);

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
