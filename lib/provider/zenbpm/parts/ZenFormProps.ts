import { createElement } from '@bpmn-io/properties-panel/preact';
import { useService } from 'bpmn-js-properties-panel';

export function ZenFormProps(element) {
  if (element.type !== 'bpmn:UserTask') {
    return [];
  }

  return [
    {
      id: 'zenFormDesignButton',
      component: ZenFormDesignButtonEntry,
      isEdited: () => false,
    }
  ];
}

function getZenFormValue(element) {
  const bo = element.businessObject;
  const extensionElements = bo.extensionElements;
  if (!extensionElements) return '';

  const ioMapping = extensionElements.values?.find(
    (e) => e.$type === 'zenbpm:IoMapping',
  );
  if (!ioMapping) return '';

  const input = (ioMapping.inputParameters || []).find(
    (p) => p.target === 'ZEN_FORM',
  );
  if (!input?.source) return '';

  // Parse FEEL string literal: ="..." → raw JSON
  const src = input.source;
  if (src.startsWith('="') && src.endsWith('"')) {
    return src.slice(2, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return src;
}

function ZenFormDesignButtonEntry(props) {
  const { element } = props;
  const translate = useService('translate');

  const handleClick = () => {
    const currentValue = getZenFormValue(element);
    document.dispatchEvent(
      new CustomEvent('bpmn-open-form-designer', {
        detail: { elementId: element.id, value: currentValue },
      }),
    );
  };

  return createElement(
    'div',
    { class: 'bio-properties-panel-entry', style: 'padding: 0 10px 6px' },
    createElement(
      'button',
      {
        type: 'button',
        onClick: handleClick,
        style:
          'width: 100%; padding: 6px 12px; cursor: pointer; ' +
          'background: #4d90fe; color: white; border: none; border-radius: 3px; ' +
          'font-size: 13px; font-weight: 500;',
      },
      translate('Design Form'),
    ),
  );
}
