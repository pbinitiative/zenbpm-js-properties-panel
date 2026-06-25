import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import { act } from '@testing-library/preact';

import { bootstrapZenBpmPropertiesPanel, inject } from 'test/TestHelper';

import { getExtensionElement } from 'lib/util/ExtensionElementsUtil';
import { __resetFormSyncCacheForTesting } from 'lib/provider/zenbpm/parts/ZenFormProps';

import diagramXML from './fixtures/ZenForm.bpmn';

/**
 * Reproduces the modeler's save-form flow and asserts the two fixed
 * behaviours: output mappings are created on the FIRST save, and a
 * pre-existing (manual) output is never deleted.
 */
describe('provider/zenbpm - ZenForm output auto-sync', function() {

  let container;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML));

  // Reset the module-scoped dedup guard so tests stay isolated.
  beforeEach(() => __resetFormSyncCacheForTesting());

  function ioMappingOf(element) {
    return getExtensionElement(element.businessObject, 'zenbpm:IoMapping');
  }

  function outputsOf(element) {
    return ioMappingOf(element)?.outputParameters || [];
  }

  function inputsOf(element) {
    return ioMappingOf(element)?.inputParameters || [];
  }

  /** Mirror of `useBpmnEditor.updateZenFormProperty` in zenbpm-ui. */
  function saveZenForm(elementRegistry, commandStack, bpmnFactory, elementId, schema) {
    const element = elementRegistry.get(elementId);
    expect(element, `element ${elementId}`).to.exist;

    const feelSource = '="' + JSON.stringify(schema)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"') + '"';

    const bo = element.businessObject;
    const commands = [];

    let extensionElements = bo.extensionElements;
    if (!extensionElements) {
      extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
      extensionElements.$parent = bo;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element, moddleElement: bo, properties: { extensionElements } },
      });
    }

    let ioMapping = (extensionElements.values || []).find(
      (e) => e.$type === 'zenbpm:IoMapping',
    );
    if (!ioMapping) {
      ioMapping = bpmnFactory.create('zenbpm:IoMapping', {
        inputParameters: [],
        outputParameters: [],
      });
      ioMapping.$parent = extensionElements;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element,
          moddleElement: extensionElements,
          properties: { values: [...(extensionElements.values || []), ioMapping] },
        },
      });
    }

    const inputs = ioMapping.inputParameters || [];
    const existingInput = inputs.find((p) => p.target === 'ZEN_FORM');

    if (existingInput) {
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element, moddleElement: existingInput, properties: { source: feelSource } },
      });
    } else {
      const newInput = bpmnFactory.create('zenbpm:Input', {
        source: feelSource,
        target: 'ZEN_FORM',
      });
      newInput.$parent = ioMapping;
      commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
          element,
          moddleElement: ioMapping,
          properties: { inputParameters: [...inputs, newInput] },
        },
      });
    }

    commandStack.execute('properties-panel.multi-command-executor', commands);
  }

  // The auto-sync is deferred via setTimeout(0); flush before asserting.
  async function flushSync() {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }

  // Two keyed components + a nested one to exercise recursive key extraction.
  const FORM_SCHEMA = {
    components: [
      { key: 'firstName', type: 'textfield' },
      { key: 'age', type: 'number' },
      {
        key: 'address',
        type: 'container',
        components: [ { key: 'city', type: 'textfield' } ],
      },
    ],
  };


  it('creates output mappings on the FIRST form save (no pre-existing ioMapping)', inject(
    async function(elementRegistry, commandStack, bpmnFactory) {
      // given — a bare user task with no extensionElements
      const userTask = elementRegistry.get('UserTask_empty');
      expect(outputsOf(userTask).length, 'no outputs beforehand').to.equal(0);

      // when — first save (the "create" path)
      await act(() => saveZenForm(elementRegistry, commandStack, bpmnFactory, 'UserTask_empty', FORM_SCHEMA));
      await flushSync();

      // then — outputs for every form field key are created immediately
      const outputs = outputsOf(userTask);
      const targets = outputs.map((o) => o.target).sort();
      expect(targets, 'one output per form field key (incl. nested)').to.deep.equal([
        'address', 'age', 'city', 'firstName',
      ]);
      expect(outputs.find((o) => o.source === '=firstName'), 'source is =<key>').to.exist;
    },
  ));


  it('creates output mappings on the first form save when extensionElements already exist', inject(
    async function(elementRegistry, commandStack, bpmnFactory) {
      // given — user task carrying a sibling assignment element but no ioMapping
      const userTask = elementRegistry.get('UserTask_withSibling');
      expect(outputsOf(userTask).length).to.equal(0);

      // when
      await act(() => saveZenForm(elementRegistry, commandStack, bpmnFactory, 'UserTask_withSibling', FORM_SCHEMA));
      await flushSync();

      // then
      const targets = outputsOf(userTask).map((o) => o.target).sort();
      expect(targets).to.deep.equal(['address', 'age', 'city', 'firstName']);

      // and the sibling assignment element is untouched
      const kinds = (userTask.businessObject.extensionElements.values || []).map((e) => e.$type);
      expect(kinds).to.include('zenbpm:AssignmentDefinition');
    },
  ));


  it('preserves a manually-created output mapping when the form is re-saved (edit path)', inject(
    async function(elementRegistry, commandStack, bpmnFactory) {
      // given — task already has a ZEN_FORM input + a manual output
      const userTask = elementRegistry.get('UserTask_withFormAndManualOutput');
      expect(outputsOf(userTask).length, 'one manual output beforehand').to.equal(1);
      expect(outputsOf(userTask)[0].target).to.equal('myResult');

      // when — the form is re-saved (existingInput path => updates Input.source)
      await act(() => saveZenForm(elementRegistry, commandStack, bpmnFactory, 'UserTask_withFormAndManualOutput', FORM_SCHEMA));
      await flushSync();

      // then — the manual output survives, and form-field outputs are ADDED
      const outputs = outputsOf(userTask);
      const targets = outputs.map((o) => o.target).sort();
      expect(targets).to.include('myResult');
      expect(targets).to.deep.equal(
        ['address', 'age', 'city', 'firstName', 'myResult'].sort(),
      );
      expect(outputs.find((o) => o.source === '=result' && o.target === 'myResult'), 'manual output kept intact').to.exist;
    },
  ));


  it('does not duplicate an output when a form field already maps to it', inject(
    async function(elementRegistry, commandStack, bpmnFactory) {
      // given — first save creates the outputs for firstName et al.
      const userTask = elementRegistry.get('UserTask_empty');
      await act(() => saveZenForm(elementRegistry, commandStack, bpmnFactory, 'UserTask_empty', FORM_SCHEMA));
      await flushSync();
      expect(outputsOf(userTask).map((o) => o.target)).to.include('firstName');

      // when — the exact same form is saved again
      await act(() => saveZenForm(elementRegistry, commandStack, bpmnFactory, 'UserTask_empty', FORM_SCHEMA));
      await flushSync();

      // then — no duplicate outputs
      const outputs = outputsOf(userTask);
      const firstNameOutputs = outputs.filter((o) => o.source === '=firstName');
      expect(firstNameOutputs.length, 'exactly one output per form field').to.equal(1);
      expect(outputs.length, 'same number of outputs').to.equal(4);
    },
  ));


  it('keeps the ZEN_FORM input as the one and only source of truth for the form JSON', inject(
    async function(elementRegistry, commandStack, bpmnFactory) {
      // given
      const userTask = elementRegistry.get('UserTask_empty');

      // when
      await act(() => saveZenForm(elementRegistry, commandStack, bpmnFactory, 'UserTask_empty', FORM_SCHEMA));
      await flushSync();

      // then — exactly one ZEN_FORM input, target preserved
      const zenInputs = inputsOf(userTask).filter((i) => i.target === 'ZEN_FORM');
      expect(zenInputs.length, 'exactly one ZEN_FORM input').to.equal(1);
    },
  ));

});