import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import { act, fireEvent } from '@testing-library/preact';

import { bootstrapZenBpmPropertiesPanel, getBpmnJS, inject } from 'test/TestHelper';

import { query as domQuery, queryAll as domQueryAll } from 'min-dom';

import { getProperties, getPropertiesList } from 'lib/provider/zenbpm/parts/ExtensionPropertiesProps';

import diagramXML from './fixtures/ExtensionProperties.bpmn';


describe('provider/zenbpm - ExtensionProperties', function() {

  const GROUP_SELECTOR = '[data-group-id="group-zenbpm-extensionProperties"]';

  let container;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML));


  function getGroup() {
    return domQuery(GROUP_SELECTOR, container);
  }

  function getAddButton() {
    return domQuery('.bio-properties-panel-add-entry', getGroup());
  }


  it('should render group for any element with properties', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_with');

    // when
    await act(() => selection.select(serviceTask));

    // then
    expect(getGroup(), 'group').to.exist;
    const items = domQueryAll('.bio-properties-panel-collapsible-entry', getGroup());
    expect(items.length).to.equal(2);
  }));


  it('should render group for element with no properties yet', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_empty');

    // when
    await act(() => selection.select(serviceTask));

    // then
    expect(getGroup(), 'group').to.exist;
    const items = domQueryAll('.bio-properties-panel-collapsible-entry', getGroup());
    expect(items.length).to.equal(0);
  }));


  it('should add a property', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_empty');

    // assume
    expect(getProperties(serviceTask)).not.to.exist;

    await act(() => selection.select(serviceTask));

    // when
    await act(() => fireEvent.click(getAddButton()));

    // then
    expect(getProperties(serviceTask)).to.exist;
    expect(getPropertiesList(serviceTask).length).to.equal(1);
  }));


  it('should re-use existing extensionElements when adding', inject(async function(elementRegistry, selection) {

    // given — element has extensionElements (with TaskDefinition) but no Properties
    const serviceTask = elementRegistry.get('ServiceTask_withTaskDef');

    // assume
    const bo = serviceTask.businessObject;
    expect(bo.extensionElements).to.exist;
    expect(getProperties(serviceTask)).not.to.exist;

    await act(() => selection.select(serviceTask));

    // when
    await act(() => fireEvent.click(getAddButton()));

    // then
    expect(getProperties(serviceTask)).to.exist;
    expect(getPropertiesList(serviceTask).length).to.equal(1);
    // the existing TaskDefinition is preserved alongside the new Properties
    expect(bo.extensionElements.values.length).to.equal(2);
  }));


  it('should update property name', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_with');

    await act(() => selection.select(serviceTask));

    // when
    const nameInput = domQuery('input[name*="-zenbpm-extensionProperty-0-name"]', container);
    fireEvent.input(nameInput, { target: { value: 'newName' } });

    // then
    expect(getPropertiesList(serviceTask)[0].get('name')).to.equal('newName');
  }));


  it('should update property value', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_with');

    await act(() => selection.select(serviceTask));

    // when
    const valueInput = domQuery('input[name*="-zenbpm-extensionProperty-0-value"]', container);
    fireEvent.input(valueInput, { target: { value: 'newValue' } });

    // then
    expect(getPropertiesList(serviceTask)[0].get('value')).to.equal('newValue');
  }));


  it('should remove a property and keep the container when others remain', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_with');

    await act(() => selection.select(serviceTask));

    // when
    const removeButton = domQuery('.bio-properties-panel-remove-entry', getGroup());
    await act(() => fireEvent.click(removeButton));

    // then
    expect(getPropertiesList(serviceTask).length).to.equal(1);
    expect(getProperties(serviceTask)).to.exist;
  }));


  it('should drop the zenbpm:Properties container when the last property is removed', inject(async function(elementRegistry, selection) {

    // given — ServiceTask_one has exactly one property
    const serviceTask = elementRegistry.get('ServiceTask_one');

    await act(() => selection.select(serviceTask));

    // when
    const removeButton = domQuery('.bio-properties-panel-remove-entry', getGroup());
    await act(() => fireEvent.click(removeButton));

    // then
    expect(getPropertiesList(serviceTask).length).to.equal(0);
    expect(getProperties(serviceTask)).not.to.exist;
  }));


  it('should drop the now-empty bpmn:ExtensionElements container when the last property is removed', inject(async function(elementRegistry, selection) {

    // given — ServiceTask_one's extensionElements holds ONLY zenbpm:Properties,
    // so removing the last property must also clean up the empty
    // <bpmn:extensionElements> wrapper (otherwise it serializes as dirty XML).
    const serviceTask = elementRegistry.get('ServiceTask_one');
    const bo = serviceTask.businessObject;

    // assume
    expect(bo.extensionElements, 'extensionElements exists before').to.exist;
    expect((bo.extensionElements.values || []).length).to.equal(1);

    await act(() => selection.select(serviceTask));

    // when
    const removeButton = domQuery('.bio-properties-panel-remove-entry', getGroup());
    await act(() => fireEvent.click(removeButton));

    // then — the empty extensionElements container is removed from the parent
    expect(bo.extensionElements, 'extensionElements dropped when empty').not.to.exist;
  }));


  it('should preserve added properties on undo', inject(async function(elementRegistry, selection, commandStack) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_empty');

    await act(() => selection.select(serviceTask));
    await act(() => fireEvent.click(getAddButton()));

    // assume
    expect(getPropertiesList(serviceTask).length).to.equal(1);

    // when
    await act(() => commandStack.undo());

    // then
    expect(getPropertiesList(serviceTask).length).to.equal(0);
  }));


  it('should serialize to lowercase <zenbpm:properties>/<zenbpm:property> XML on export', inject(async function(elementRegistry, selection) {

    // given — a task with a property
    const serviceTask = elementRegistry.get('ServiceTask_with');

    // when — export the diagram
    const bpmnjs = getBpmnJS();
    const { xml } = await bpmnjs.saveXML({ format: true });

    // then — XML uses lowercase tag names (moddle tagAlias: lowerCase)
    expect(xml).to.match(/<zenbpm:properties[\s>]/);
    expect(xml).to.match(/<zenbpm:property\s/);
    expect(xml).not.to.match(/<zenbpm:Properties[\s>]/);
    expect(xml).not.to.match(/<zenbpm:Property\s/);
  }));


  describe('*Modeler:* properties get JSON-validated', function() {

    it('should show an inline error for a non-example-data *Modeler:* property with invalid JSON', inject(async function(elementRegistry, selection) {

      // given — ServiceTask_withModelerInvalid has "zenbpmModeler:badJson"="not json {"
      // ("badJson" is NOT in the EXAMPLE_DATA_PROPERTIES list, so it stays in
      // the Extension properties section.)
      const serviceTask = elementRegistry.get('ServiceTask_withModelerInvalid');
      await act(() => selection.select(serviceTask));

      // then
      const error = domQuery('.bio-properties-panel-error', getGroup());
      expect(error, 'error for invalid JSON').to.exist;
      expect(error.textContent || '').to.match(/JSON/i);
    }));


    it('should NOT validate non-*Modeler:* properties as JSON (single-line input still works)', inject(async function(elementRegistry, selection) {

      // given — ServiceTask_with has "name"=Honza, "role"=admin
      const serviceTask = elementRegistry.get('ServiceTask_with');
      await act(() => selection.select(serviceTask));

      // then — both value fields stay as plain <input> elements
      const inputs = domQueryAll('input[name*="-zenbpm-extensionProperty-"][name*="-value"]', container);
      expect(inputs.length).to.equal(2);
      // ...and no JSON error is shown
      const error = domQuery('.bio-properties-panel-error', getGroup());
      expect(error, 'no error for non-modeler properties').not.to.exist;
    }));
  });


  describe('Example data (dedicated section for known *Modeler:* properties)', function() {

    const EXAMPLE_DATA_GROUP_SELECTOR = '[data-group-id="group-zenbpm-exampleData"]';

    function getExampleDataGroup() {
      return domQuery(EXAMPLE_DATA_GROUP_SELECTOR, container);
    }

    function exampleDataValueInput() {
      return domQuery('textarea[name*="zenbpm-exampleData-"]', container);
    }


    it('should render the "Example data" group', inject(async function(elementRegistry, selection) {

      // given
      const serviceTask = elementRegistry.get('ServiceTask_withModeler');
      await act(() => selection.select(serviceTask));

      // then
      const group = getExampleDataGroup();
      expect(group, 'Example data group').to.exist;
      expect(group.getAttribute('data-group-id')).to.equal('group-zenbpm-exampleData');
    }));


    it('should render the "Example output" entry as a <textarea> with the model value', inject(async function(elementRegistry, selection) {

      // given — ServiceTask_withModeler has "zenbpmModeler:exampleOutputJson"=`{"abc":123}`
      const serviceTask = elementRegistry.get('ServiceTask_withModeler');
      await act(() => selection.select(serviceTask));

      // then
      const textarea = exampleDataValueInput();
      expect(textarea, 'textarea for Example output').to.exist;
      expect(textarea.value).to.include('"abc":123');
    }));


    it('should not show an error for a valid JSON value', inject(async function(elementRegistry, selection) {

      // given
      const serviceTask = elementRegistry.get('ServiceTask_withModeler');
      await act(() => selection.select(serviceTask));

      // then
      const error = domQuery('.bio-properties-panel-error', getExampleDataGroup());
      expect(error, 'no error for valid JSON').not.to.exist;
    }));


    it('should show an inline error when the value is edited to invalid JSON', inject(async function(elementRegistry, selection) {

      // given
      const serviceTask = elementRegistry.get('ServiceTask_withModeler');
      await act(() => selection.select(serviceTask));

      // when
      const textarea = exampleDataValueInput();
      await act(() => fireEvent.input(textarea, { target: { value: 'not json {' } }));

      // then
      const error = domQuery('.bio-properties-panel-error', getExampleDataGroup());
      expect(error, 'error after editing to invalid JSON').to.exist;
      expect(error.textContent || '').to.match(/JSON/i);
    }));


    it('should update the underlying moddle property when the value is edited', inject(async function(elementRegistry, selection) {

      // given
      const serviceTask = elementRegistry.get('ServiceTask_withModeler');
      await act(() => selection.select(serviceTask));

      // when
      const textarea = exampleDataValueInput();
      await act(() => fireEvent.input(textarea, { target: { value: '{"xyz":456}' } }));

      // then
      const props = getPropertiesList(serviceTask);
      const prop = props.find((p: any) => p.get('name') === 'zenbpmModeler:exampleOutputJson');
      expect(prop, 'moddle property exists').to.exist;
      expect(prop.get('value')).to.equal('{"xyz":456}');
    }));


    it('should remove the underlying moddle property when the value is cleared', inject(async function(elementRegistry, selection) {

      // given
      const serviceTask = elementRegistry.get('ServiceTask_withModeler');
      await act(() => selection.select(serviceTask));
      const propsBefore = getPropertiesList(serviceTask);
      expect(
        propsBefore.find((p: any) => p.get('name') === 'zenbpmModeler:exampleOutputJson'),
        'fixture sanity: moddle property exists before clear',
      ).to.exist;

      // when
      const textarea = exampleDataValueInput();
      await act(() => fireEvent.input(textarea, { target: { value: '' } }));

      // then
      const propsAfter = getPropertiesList(serviceTask);
      expect(
        propsAfter.find((p: any) => p.get('name') === 'zenbpmModeler:exampleOutputJson'),
        'moddle property removed after clear',
      ).not.to.exist;
    }));


    it('should drop the now-empty bpmn:ExtensionElements container when the last example-data property is cleared', inject(async function(elementRegistry, selection) {

      // given — ServiceTask_withModeler's extensionElements holds ONLY the
      // zenbpm:Properties container, so clearing the example output value must
      // also clean up the empty <bpmn:extensionElements> wrapper (otherwise it
      // serializes as dirty XML).
      const serviceTask = elementRegistry.get('ServiceTask_withModeler');
      const bo = serviceTask.businessObject;

      // assume
      expect(bo.extensionElements, 'extensionElements exists before').to.exist;
      expect((bo.extensionElements.values || []).length).to.equal(1);

      await act(() => selection.select(serviceTask));

      // when
      const textarea = exampleDataValueInput();
      await act(() => fireEvent.input(textarea, { target: { value: '' } }));

      // then — the empty extensionElements container is removed from the parent
      expect(bo.extensionElements, 'extensionElements dropped when empty').not.to.exist;
    }));


    it('should hide example-data properties from the Extension properties section', inject(async function(elementRegistry, selection) {

      // given — ServiceTask_withModeler has only "zenbpmModeler:exampleOutputJson"
      // which is an example-data property and must NOT appear in the generic
      // Extension properties list.
      const serviceTask = elementRegistry.get('ServiceTask_withModeler');
      await act(() => selection.select(serviceTask));

      // then — the Extension properties section is rendered but with 0 items
      expect(getGroup(), 'Extension properties group still rendered').to.exist;
      expect(domQueryAll('.bio-properties-panel-collapsible-entry', getGroup()).length)
        .to.equal(0);
    }));
  });

});
