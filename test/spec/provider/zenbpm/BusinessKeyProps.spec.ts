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

  it('should show configured override and expression', inject(async function(elementRegistry, selection) {
    const callActivity = elementRegistry.get('CallActivity_Configured');

    await act(() => {
      selection.select(callActivity);
    });

    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    const expression = domQuery('[data-entry-id="zenbpm-businessKey-expression"] [role="textbox"]', container);
    const expressionContainer = domQuery('[data-entry-id="zenbpm-businessKey-expression"] .bio-properties-panel-feel-editor-container', container);

    expect(checkbox.checked).to.be.true;
    expect(expression.textContent).to.equal('processBusinessKey');
    expect(expressionContainer.classList.contains('disabled')).to.be.false;
  }));

  it('should disable expression while override is unchecked', inject(async function(elementRegistry, selection) {
    await act(() => {
      selection.select(elementRegistry.get('SubProcess_Expanded'));
    });

    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    const expressionContainer = domQuery('[data-entry-id="zenbpm-businessKey-expression"] .bio-properties-panel-feel-editor-container', container);

    expect(checkbox.checked).to.be.false;
    expect(expressionContainer.classList.contains('disabled')).to.be.true;
  }));

  it('should create and remove the business key input', inject(async function(elementRegistry, selection) {
    const subProcess = elementRegistry.get('SubProcess_Expanded');

    await act(() => {
      selection.select(subProcess);
    });

    const checkbox = domQuery('input[name="zenbpm-businessKey-override"]', container) as HTMLInputElement;
    const disabledExpression = domQuery('[data-entry-id="zenbpm-businessKey-expression"] [role="textbox"]', container);
    const disabledExpressionContainer = domQuery('[data-entry-id="zenbpm-businessKey-expression"] .bio-properties-panel-feel-editor-container', container);
    expect(getBusinessKeyInput(subProcess)).not.to.exist;
    expect(disabledExpressionContainer.classList.contains('disabled')).to.be.true;

    await act(() => {
      clickInput(checkbox);
    });

    const enabledExpression = domQuery('[data-entry-id="zenbpm-businessKey-expression"] [role="textbox"]', container);
    const enabledExpressionContainer = domQuery('[data-entry-id="zenbpm-businessKey-expression"] .bio-properties-panel-feel-editor-container', container);
    expect(getBusinessKeyInput(subProcess)).to.exist;
    expect(getBusinessKeyInput(subProcess).businessKey).to.equal('');
    expect(enabledExpressionContainer.classList.contains('disabled')).to.be.false;
    expect(enabledExpression === disabledExpression).to.be.false;

    await setEditorValue(enabledExpression, 'newBusinessKey');
    expect(getBusinessKeyInput(subProcess).businessKey).to.equal('=newBusinessKey');

    await act(() => {
      clickInput(checkbox);
    });

    const disabledAgainExpression = domQuery('[data-entry-id="zenbpm-businessKey-expression"] [role="textbox"]', container);
    const disabledAgainExpressionContainer = domQuery('[data-entry-id="zenbpm-businessKey-expression"] .bio-properties-panel-feel-editor-container', container);
    expect(getBusinessKeyInput(subProcess)).not.to.exist;
    expect(subProcess.businessObject.extensionElements).not.to.exist;
    expect(disabledAgainExpressionContainer.classList.contains('disabled')).to.be.true;
    expect(disabledAgainExpression === enabledExpression).to.be.false;
  }));

  it('should update the FEEL expression', inject(async function(elementRegistry, selection) {
    const callActivity = elementRegistry.get('CallActivity_Configured');

    await act(() => {
      selection.select(callActivity);
    });

    const expression = domQuery('[data-entry-id="zenbpm-businessKey-expression"] [role="textbox"]', container);
    await setEditorValue(expression, 'newBusinessKey');

    expect(getBusinessKeyInput(callActivity).businessKey).to.equal('=newBusinessKey');
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
