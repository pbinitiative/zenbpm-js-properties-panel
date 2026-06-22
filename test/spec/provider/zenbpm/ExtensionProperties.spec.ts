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

});
