import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import { act } from '@testing-library/preact';
import { query as domQuery } from 'min-dom';

import {
  bootstrapZenBpmPropertiesPanel,
  findGroup,
  getBpmnJS,
  inject,
} from 'test/TestHelper';

import diagramXML from './fixtures/UnsupportedProperties.bpmn';

describe('provider/zenbpm - unsupported properties', function() {
  let container: HTMLElement;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML));

  it('should offer only supported binding types for called elements and decisions', inject(async function(elementRegistry, selection) {
    for (const [ elementId, entryId ] of [
      [ 'CallActivity_1', 'zenbpm-calledEl-bindingType' ],
      [ 'BusinessRuleTask_1', 'zenbpm-calledDecision-bindingType' ],
    ]) {
      await act(() => {
        selection.select(elementRegistry.get(elementId));
      });

      const select = domQuery(`select[name="${entryId}"]`, container) as HTMLSelectElement;

      expect(select, elementId).to.exist;
      expect(Array.from(select.options).map(({ value }) => value), elementId).to.eql([
        'latest',
        'versionTag',
      ]);
    }
  }));

  it('should not render propagation controls for a call activity', inject(async function(elementRegistry, selection) {
    await act(() => {
      selection.select(elementRegistry.get('CallActivity_1'));
    });

    const group = findGroup(container, 'zenbpm-calledElement');

    expect(group).to.exist;
    expect(domQuery('[data-entry-id="zenbpm-calledEl-propagateAllChildVariables"]', group)).not.to.exist;
    expect(domQuery('[data-entry-id="zenbpm-calledEl-propagateAllParentVariables"]', group)).not.to.exist;
  }));

  it('should discard legacy unsupported attributes when serializing an imported diagram', inject(async function() {
    const { xml } = await getBpmnJS().saveXML({ format: true });

    expect(xml).to.match(/<zenbpm:calledElement\b(?=[^>]*processId="ChildProcess")[^>]*\/>/);
    expect(xml).to.match(/<zenbpm:calledDecision\b(?=[^>]*decisionId="EvaluateDecision")[^>]*\/>/);
    expect(xml).not.to.include('bindingType="deployment"');
    expect(xml).not.to.include('propagateAllChildVariables');
    expect(xml).not.to.include('propagateAllParentVariables');
  }));

  it('should make import cleanup undoable and only mark legacy diagrams as changed', inject(async function(commandStack) {
    expect(commandStack.canUndo()).to.be.true;

    commandStack.undo();

    const { xml: legacyXml } = await getBpmnJS().saveXML({ format: true });

    expect(legacyXml).to.include('bindingType="deployment"');
    expect(legacyXml).to.include('propagateAllChildVariables="true"');
    expect(legacyXml).to.include('propagateAllParentVariables="false"');

    commandStack.redo();

    const { xml: cleanedXml } = await getBpmnJS().saveXML({ format: true });

    expect(cleanedXml).not.to.include('bindingType="deployment"');
    expect(cleanedXml).not.to.include('propagateAllChildVariables');
    expect(cleanedXml).not.to.include('propagateAllParentVariables');

    await getBpmnJS().importXML(cleanedXml);

    expect(commandStack.canUndo()).to.be.false;
  }));
});
