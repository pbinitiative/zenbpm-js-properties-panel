import { ZenFormProps } from './parts/ZenFormProps';

export class ZenBpmPropertiesProvider {
  static $inject = ['propertiesPanel'];

  constructor(propertiesPanel) {
    propertiesPanel.registerProvider(500, this);
  }

  getGroups(element) {
    return function (groups) {
      if (element.type === 'bpmn:UserTask') {
        groups.push({
          id: 'zenbpm-form',
          label: 'Zen Form',
          entries: ZenFormProps(element),
        });
      }
      return groups;
    };
  }
}
