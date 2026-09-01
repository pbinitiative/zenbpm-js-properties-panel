import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import { act } from '@testing-library/preact';
import { query as domQuery } from 'min-dom';

import {
  bootstrapZenBpmPropertiesPanel,
  clickInput,
  findGroup,
  inject,
  setEditorValue,
} from 'test/TestHelper';

import { getBusinessKeyInput } from 'lib/provider/zenbpm/parts/BusinessKeyProps';
import diagramXML from './fixtures/BusinessKeyProps.bpmn';

describe('provider/zenbpm - BusinessKeyProps', function() {
  let container: HTMLElement;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML));

  it('should display for Call Activity and expanded and collapsed SubProcess', inject(async function(elementRegistry, selection) {
    for (const elementId of [
      'CallActivity_Configured',
      'SubProcess_Expanded',
      'SubProcess_Collapsed',
    ]) {
      await act(() => {
        selection.select(elementRegistry.get(elementId));
      });

      expect(findGroup(container, 'zenbpm-businessKey'), elementId).to.exist;
    }
  }));

  it('should not display for unrelated elements', inject(async function(elementRegistry, selection) {
    await act(() => {
      selection.select(elementRegistry.get('ServiceTask_1'));
    });

    expect(findGroup(container, 'zenbpm-businessKey')).not.to.exist;
  }));

  it('should show configured overrides in a required FEEL editor only', inject(async function(elementRegistry, selection) {
    const callActivity = elementRegistry.get('CallActivity_Configured');

    await act(() => {
      selection.select(callActivity);
    });

    const entry = domQuery('[data-entry-id="zenbpm-businessKey-expression"]', container);
    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    const expression = domQuery('[role="textbox"]', entry);
    const feelModeButton = domQuery('.bio-properties-panel-feel-icon', entry) as HTMLButtonElement;

    expect(checkbox.checked).to.be.true;
    expect(expression.textContent).to.equal('processBusinessKey');
    expect(domQuery('.bio-properties-panel-feel-editor-container', entry)).to.exist;
    expect(domQuery('input[name="zenbpm-businessKey-expression"]', entry)).not.to.exist;
    expect(feelModeButton).to.exist;
    expect(feelModeButton.disabled).to.be.true;
  }));

  it('should render only the override checkbox while override is unchecked', inject(async function(elementRegistry, selection) {
    await act(() => {
      selection.select(elementRegistry.get('SubProcess_Expanded'));
    });

    const group = findGroup(container, 'zenbpm-businessKey');
    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', group) as HTMLInputElement;

    expect(checkbox.checked).to.be.false;
    expect(domQuery('[data-entry-id="zenbpm-businessKey-expression"]', group)).not.to.exist;
    expect(domQuery('[role="textbox"]', group)).not.to.exist;
  }));

  it('should keep an imported input without businessKey unchecked with no editor bypass', inject(async function(elementRegistry, selection) {
    const callActivity = elementRegistry.get('CallActivity_Inherit');

    await act(() => {
      selection.select(callActivity);
    });

    const group = findGroup(container, 'zenbpm-businessKey');
    const groupEntries = domQuery('.bio-properties-panel-group-entries', group) as HTMLElement;
    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', group) as HTMLInputElement;
    const focusableControls = groupEntries.querySelectorAll(
      'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    );

    expect(getBusinessKeyInput(callActivity)).to.exist;
    expect(getBusinessKeyInput(callActivity).businessKey).to.equal(undefined);
    expect(checkbox.checked).to.be.false;
    expect(domQuery('[data-entry-id="zenbpm-businessKey-expression"]', group)).not.to.exist;
    expect(domQuery('[role="textbox"]', group)).not.to.exist;
    expect(focusableControls).to.have.length(1);
    expect(focusableControls[0]).to.equal(checkbox);
  }));

  it('should turn an imported input without businessKey into an explicit empty override and show the editor', inject(async function(elementRegistry, selection) {
    const callActivity = elementRegistry.get('CallActivity_Inherit');

    await act(() => {
      selection.select(callActivity);
    });

    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    expect(domQuery('[data-entry-id="zenbpm-businessKey-expression"]', container)).not.to.exist;

    await act(() => {
      clickInput(checkbox);
    });

    const entry = domQuery('[data-entry-id="zenbpm-businessKey-expression"]', container);
    const updatedCheckbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    const expression = domQuery('[role="textbox"]', entry);

    expect(getBusinessKeyInput(callActivity)).to.exist;
    expect(getBusinessKeyInput(callActivity).businessKey).to.equal('');
    expect(updatedCheckbox.checked).to.be.true;
    expect(expression).to.exist;
    expect(domQuery('.bio-properties-panel-feel-editor-container', entry)).to.exist;
    expect(domQuery('input[name="zenbpm-businessKey-expression"]', entry)).not.to.exist;
  }));

  it('should create, edit, and remove the business key input', inject(async function(elementRegistry, selection) {
    const subProcess = elementRegistry.get('SubProcess_Expanded');

    await act(() => {
      selection.select(subProcess);
    });

    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    expect(getBusinessKeyInput(subProcess)).not.to.exist;
    expect(domQuery('[data-entry-id="zenbpm-businessKey-expression"]', container)).not.to.exist;

    await act(() => {
      clickInput(checkbox);
    });

    const enabledEntry = domQuery('[data-entry-id="zenbpm-businessKey-expression"]', container);
    const enabledExpression = domQuery('[role="textbox"]', enabledEntry);
    expect(getBusinessKeyInput(subProcess)).to.exist;
    expect(getBusinessKeyInput(subProcess).businessKey).to.equal('');
    expect(enabledExpression).to.exist;
    expect(domQuery('.bio-properties-panel-feel-editor-container', enabledEntry)).to.exist;
    expect(domQuery('input[name="zenbpm-businessKey-expression"]', enabledEntry)).not.to.exist;

    await setEditorValue(enabledExpression, 'newBusinessKey');
    expect(getBusinessKeyInput(subProcess).businessKey).to.equal('=newBusinessKey');

    const updatedCheckbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    await act(() => {
      clickInput(updatedCheckbox);
    });

    expect(getBusinessKeyInput(subProcess)).not.to.exist;
    expect(subProcess.businessObject.extensionElements).not.to.exist;
    expect(domQuery('[data-entry-id="zenbpm-businessKey-expression"]', container)).not.to.exist;
    expect(domQuery('[role="textbox"]', findGroup(container, 'zenbpm-businessKey'))).not.to.exist;
  }));

  it('should display and persist configured FEEL without duplicating the prefix', inject(async function(elementRegistry, selection) {
    const subProcess = elementRegistry.get('SubProcess_Collapsed');

    await act(() => {
      selection.select(subProcess);
    });

    const entry = domQuery('[data-entry-id="zenbpm-businessKey-expression"]', container);
    const expression = domQuery('[role="textbox"]', entry);

    expect(expression).to.exist;
    expect(expression.textContent).to.equal('businessPrefix + "-" + customerId');
    expect(domQuery('input[name="zenbpm-businessKey-expression"]', entry)).not.to.exist;

    await setEditorValue(expression, 'region + "-" + orderId');

    expect(getBusinessKeyInput(subProcess).businessKey).to.equal('=region + "-" + orderId');
  }));

  it('should keep an explicit empty override when the required FEEL editor is cleared', inject(async function(elementRegistry, selection) {
    const callActivity = elementRegistry.get('CallActivity_Configured');

    await act(() => {
      selection.select(callActivity);
    });

    const expression = domQuery('[data-entry-id="zenbpm-businessKey-expression"] [role="textbox"]', container);
    await setEditorValue(expression, '');

    const entry = domQuery('[data-entry-id="zenbpm-businessKey-expression"]', container);
    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;

    expect(getBusinessKeyInput(callActivity)).to.exist;
    expect(getBusinessKeyInput(callActivity).businessKey).to.equal('');
    expect(checkbox.checked).to.be.true;
    expect(domQuery('[role="textbox"]', entry)).to.exist;
    expect(domQuery('input[name="zenbpm-businessKey-expression"]', entry)).not.to.exist;
  }));

  it('should show translated FEEL-only guidance beneath an enabled editor', inject(async function(elementRegistry, selection) {
    await act(() => {
      selection.select(elementRegistry.get('SubProcess_Collapsed'));
    });

    const entry = domQuery('[data-entry-id="zenbpm-businessKey-expression"]', container);
    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    const description = domQuery('.bio-properties-panel-description', entry);

    expect(checkbox.checked).to.be.true;
    expect(entry).to.exist;
    expect(description).to.exist;
    expect(description.textContent).to.equal('Example: userId + "-" + orderId. Invalid expressions or non-string results create an incident.');
  }));

  it('should ignore a stale editor update when the businessKey override is absent', inject(async function(elementRegistry, selection) {
    const callActivity = elementRegistry.get('CallActivity_Configured');

    await act(() => {
      selection.select(callActivity);
    });

    const input = getBusinessKeyInput(callActivity);
    const expression = domQuery('[data-entry-id="zenbpm-businessKey-expression"] [role="textbox"]', container);

    // Simulate a stale editor callback after the override state has changed.
    input.businessKey = undefined;
    await setEditorValue(expression, 'bypass');

    expect(input.businessKey).to.equal(undefined);
  }));

  it('should preserve sibling extensions and support undo', inject(async function(elementRegistry, selection, commandStack) {
    const callActivity = elementRegistry.get('CallActivity_Configured');

    await act(() => {
      selection.select(callActivity);
    });

    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    await act(() => {
      clickInput(checkbox);
    });

    expect(getBusinessKeyInput(callActivity)).not.to.exist;
    expect(callActivity.businessObject.extensionElements.values).to.have.length(1);
    expect(callActivity.businessObject.extensionElements.values[0].$type).to.equal('zenbpm:CalledElement');

    await act(() => {
      commandStack.undo();
    });

    expect(getBusinessKeyInput(callActivity)).to.exist;
    expect(getBusinessKeyInput(callActivity).businessKey).to.equal('=processBusinessKey');
  }));
});
