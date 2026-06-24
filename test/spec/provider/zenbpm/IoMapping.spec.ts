import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import { act, fireEvent } from '@testing-library/preact';

import { bootstrapZenBpmPropertiesPanel, getBpmnJS, inject } from 'test/TestHelper';

import { query as domQuery, queryAll as domQueryAll } from 'min-dom';

import { getExtensionElement } from 'lib/util/ExtensionElementsUtil';

import diagramXML from './fixtures/IoMapping.bpmn';


describe('provider/zenbpm - IoMapping', function() {

  const INPUT_GROUP  = '[data-group-id="group-zenbpm-ioMapping-inputs"]';
  const OUTPUT_GROUP = '[data-group-id="group-zenbpm-ioMapping-outputs"]';

  let container;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML));

  function getInputGroup()  { return domQuery(INPUT_GROUP,  container); }
  function getOutputGroup() { return domQuery(OUTPUT_GROUP, container); }

  function firstRemoveButton(group) {
    return domQuery('.bio-properties-panel-remove-entry', group);
  }

  function ioMappingOf(element) {
    return getExtensionElement(element.businessObject, 'zenbpm:IoMapping');
  }

  function inputsOf(element) {
    return ioMappingOf(element)?.inputParameters || [];
  }

  function outputsOf(element) {
    return ioMappingOf(element)?.outputParameters || [];
  }

  function childKinds(element) {
    const ext = element.businessObject.extensionElements;
    if (!ext) return null;
    return (ext.values || []).map((e) => e.$type);
  }


  it('renders the input group with two items for a service task with two inputs', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_twoInputs');

    // when
    await act(() => selection.select(serviceTask));

    // then
    const group = getInputGroup();
    expect(group, 'input group').to.exist;
    const items = domQueryAll('.bio-properties-panel-collapsible-entry', group);
    expect(items.length).to.equal(2);
  }));


  it('renders no input group for a service task with no mappings', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_empty');

    // when
    await act(() => selection.select(serviceTask));

    // then — group renders but with zero items
    const group = getInputGroup();
    expect(group, 'input group').to.exist;
    expect(domQueryAll('.bio-properties-panel-collapsible-entry', group).length).to.equal(0);
    expect(getOutputGroup(), 'output group').to.exist;
    expect(domQueryAll('.bio-properties-panel-collapsible-entry', getOutputGroup()).length).to.equal(0);
  }));


  function elementBlockFromXml(xml, elementId) {
    const tagPattern = '(?:serviceTask|userTask|sendTask|scriptTask|endEvent|intermediateThrowEvent|subProcess|callActivity)';
    const selfClosing = '<bpmn:' + tagPattern + '\\b[^>]*\\bid="' + elementId + '"[^>]*/>';
    const withBody    = '<bpmn:' + tagPattern + '\\b[^>]*\\bid="' + elementId + '"[^>]*>[\\s\\S]*?</bpmn:' + tagPattern + '>';
    const re = new RegExp('(' + selfClosing + ')|(' + withBody + ')');
    const m = xml.match(re);
    return m ? (m[1] || m[2]) : '<not-found/>';
  }


  it('keeps the ioMapping and extensionElements when one of two inputs is removed', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_twoInputs');
    await act(() => selection.select(serviceTask));

    // when
    await act(() => fireEvent.click(firstRemoveButton(getInputGroup())));

    // then
    expect(inputsOf(serviceTask).length).to.equal(1);
    expect(ioMappingOf(serviceTask), 'ioMapping should still exist').to.exist;
    expect(serviceTask.businessObject.extensionElements, 'extensionElements should still exist').to.exist;

    const bpmnjs = getBpmnJS();
    const { xml } = await bpmnjs.saveXML({ format: true });
    const block = elementBlockFromXml(xml, 'ServiceTask_twoInputs');
    expect(block).to.match(/<zenbpm:ioMapping[\s>]/);
    expect(block).to.match(/<bpmn:extensionElements[\s>]/);
  }));


  it('drops both ioMapping and extensionElements when the last input is removed and ioMapping is the only child', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_oneInput');
    await act(() => selection.select(serviceTask));

    // when
    await act(() => fireEvent.click(firstRemoveButton(getInputGroup())));

    // then
    expect(ioMappingOf(serviceTask), 'ioMapping should be gone').not.to.exist;
    expect(serviceTask.businessObject.extensionElements, 'extensionElements should be gone').not.to.exist;

    const bpmnjs = getBpmnJS();
    const { xml } = await bpmnjs.saveXML({ format: true });
    const block = elementBlockFromXml(xml, 'ServiceTask_oneInput');
    expect(block, 'self-closing tag — no extensionElements, no ioMapping').to.match(/<bpmn:serviceTask[^>]*\/>\s*$/);
  }));


  it('drops both ioMapping and extensionElements when the last output is removed and ioMapping is the only child', inject(async function(elementRegistry, selection) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_oneOutput');
    await act(() => selection.select(serviceTask));

    // when
    await act(() => fireEvent.click(firstRemoveButton(getOutputGroup())));

    // then
    expect(ioMappingOf(serviceTask), 'ioMapping should be gone').not.to.exist;
    expect(serviceTask.businessObject.extensionElements, 'extensionElements should be gone').not.to.exist;

    const bpmnjs = getBpmnJS();
    const { xml } = await bpmnjs.saveXML({ format: true });
    const block = elementBlockFromXml(xml, 'ServiceTask_oneOutput');
    expect(block, 'self-closing tag — no extensionElements, no ioMapping').to.match(/<bpmn:serviceTask[^>]*\/>\s*$/);
  }));


  it('keeps extensionElements and the sibling when a sibling extension element exists', inject(async function(elementRegistry, selection) {

    // given — user task with both an ioMapping input and an assignmentDefinition
    const userTask = elementRegistry.get('UserTask_withAssignmentAndMapping');
    await act(() => selection.select(userTask));

    // when
    await act(() => fireEvent.click(firstRemoveButton(getInputGroup())));

    // then
    expect(ioMappingOf(userTask), 'ioMapping should be gone').not.to.exist;

    const kinds = childKinds(userTask);
    expect(kinds, 'extensionElements should remain with one child').to.deep.equal([ 'zenbpm:AssignmentDefinition' ]);

    const bpmnjs = getBpmnJS();
    const { xml } = await bpmnjs.saveXML({ format: true });
    const block = elementBlockFromXml(xml, 'UserTask_withAssignmentAndMapping');
    expect(block).not.to.match(/<zenbpm:ioMapping[\s>]/);
    expect(block).to.match(/<bpmn:extensionElements[\s>]/);
    expect(block).to.match(/<zenbpm:assignmentDefinition[\s>]/);
  }));


  it('restores the ioMapping on undo', inject(async function(elementRegistry, selection, commandStack) {

    // given
    const serviceTask = elementRegistry.get('ServiceTask_oneInput');
    await act(() => selection.select(serviceTask));
    await act(() => fireEvent.click(firstRemoveButton(getInputGroup())));

    // assume
    expect(ioMappingOf(serviceTask)).not.to.exist;

    // when
    await act(() => commandStack.undo());

    // then
    expect(ioMappingOf(serviceTask), 'ioMapping should be back').to.exist;
    expect(inputsOf(serviceTask).length).to.equal(1);

    const bpmnjs = getBpmnJS();
    const { xml } = await bpmnjs.saveXML({ format: true });
    const block = elementBlockFromXml(xml, 'ServiceTask_oneInput');
    expect(block).to.match(/<zenbpm:ioMapping[\s>]/);
    expect(block).to.match(/<zenbpm:input\s/);
  }));


  it('hides the ZEN_FORM input from the input mapping list (system-managed)', inject(async function(elementRegistry, selection) {

    // given
    const userTask = elementRegistry.get('UserTask_withZenForm');
    expect(inputsOf(userTask).length, 'fixture sanity: 2 inputs in model').to.equal(2);
    const zenFormInput = inputsOf(userTask).find((p: any) => p.target === 'ZEN_FORM');
    expect(zenFormInput, 'fixture sanity: ZEN_FORM input exists in model').to.exist;

    // when
    await act(() => selection.select(userTask));

    // then — only the user-authored input is rendered
    const group = getInputGroup();
    expect(group, 'input group').to.exist;
    const items = domQueryAll('.bio-properties-panel-collapsible-entry', group);
    expect(items.length).to.equal(1);

    // ...and its label is the user-authored target, not ZEN_FORM
    const labels = Array.from(items).map((el) => el.textContent || '');
    expect(labels.some((t) => t.includes('ZEN_FORM')), 'ZEN_FORM label should be hidden').to.be.false;
    expect(labels.some((t) => t.includes('user')), 'user-authored input should be visible').to.be.true;

    // ...and the underlying ZEN_FORM data is preserved
    expect(inputsOf(userTask).length, 'ZEN_FORM input is still in the model').to.equal(2);
    const stillThere = inputsOf(userTask).find((p: any) => p.target === 'ZEN_FORM');
    expect(stillThere, 'ZEN_FORM input still in the model').to.exist;
    expect(stillThere.source, 'ZEN_FORM source preserved').to.equal('="{}"');
  }));

});
