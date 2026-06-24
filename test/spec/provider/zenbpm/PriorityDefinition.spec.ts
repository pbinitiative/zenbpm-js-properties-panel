import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import {
  act
} from '@testing-library/preact';

import {
  bootstrapZenBpmPropertiesPanel,
  changeInput,
  inject,
  setEditorValue
} from 'test/TestHelper';

import {
  query as domQuery
} from 'min-dom';

import {
  getBusinessObject
} from 'bpmn-js/lib/util/ModelUtil';

import {
  getPriorityDefinition
} from 'lib/provider/zenbpm/parts/AssignmentDefinitionProps';

import diagramXML from './fixtures/PriorityDefinition.bpmn';


describe('provider/zenbpm - PriorityDefinitionProps', function() {

  let container;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML));


  describe('zenbpm:priorityDefinition', function() {

    it('should NOT display for service task', inject(async function(elementRegistry, selection) {

      // given
      const serviceTask = elementRegistry.get('ServiceTask_1');

      await act(() => {
        selection.select(serviceTask);
      });

      // when
      const priorityInput = domQuery('[data-entry-id="zenbpm-assign-priority"]', container);

      // then
      expect(priorityInput).to.not.exist;
    }));


    it('should display for user task', inject(async function(elementRegistry, selection) {

      // given
      const userTask = elementRegistry.get('UserTask_1');

      await act(() => {
        selection.select(userTask);
      });

      // when
      const entry = domQuery('[data-entry-id="zenbpm-assign-priority"]', container);

      // then
      expect(entry).to.exist;

      // is FEEL input
      const input = domQuery('[role="textbox"]', entry);
      expect(input).to.exist;

      const priorityDefinition = getPriorityDefinition(userTask);
      const feelExpression = priorityDefinition.get('priority').substring(1);

      expect(input.textContent).to.equal(feelExpression);
    }));


    it('should update', inject(async function(elementRegistry, selection) {

      // given
      const userTask = elementRegistry.get('UserTask_1');

      await act(() => {
        selection.select(userTask);
      });

      // when
      const priorityInput = domQuery('[data-entry-id="zenbpm-assign-priority"] [role="textbox"]', container);

      await setEditorValue(priorityInput, 'newValue');

      // then
      // keep FEEL configuration
      expect(getPriorityDefinition(userTask).get('priority')).to.eql('=newValue');
    }));


    it('should undo priority update',
      inject(async function(elementRegistry, selection, commandStack) {

        // given
        const userTask = elementRegistry.get('UserTask_1');
        const originalValue = getPriorityDefinition(userTask).get('priority');

        await act(() => {
          selection.select(userTask);
        });
        const priorityInput = domQuery('[data-entry-id="zenbpm-assign-priority"] [role="textbox"]', container);
        await setEditorValue(priorityInput, 'newValue');

        // when
        await act(() => {
          commandStack.undo();
        });

        // then
        expect('=' + priorityInput.textContent).to.eql(originalValue);
      })
    );


    it('should create priority definition',
      inject(async function(elementRegistry, selection) {

        // given
        const userTask = elementRegistry.get('UserTask_2');

        // assume
        expect(getPriorityDefinition(userTask)).not.to.exist;

        await act(() => {
          selection.select(userTask);
        });

        // when
        const priorityInput = domQuery('input[name="zenbpm-assign-priority"]', container);
        changeInput(priorityInput, 'newValue');

        // then
        const priorityDefinition = getPriorityDefinition(userTask);
        expect(priorityDefinition).to.exist;
        expect(priorityDefinition.get('priority')).to.eql('newValue');
      })
    );


    it('should re-use existing extension elements, creating new priority definition',
      inject(async function(elementRegistry, selection) {

        // given
        const userTask = elementRegistry.get('UserTask_3');

        // assume
        expect(getBusinessObject(userTask).get('extensionElements')).to.exist;
        expect(getPriorityDefinition(userTask)).not.to.exist;

        await act(() => {
          selection.select(userTask);
        });

        // when
        const priorityInput = domQuery('input[name="zenbpm-assign-priority"]', container);
        changeInput(priorityInput, 'newValue');

        // then
        const extensionElements = getBusinessObject(userTask).get('extensionElements');
        expect(getPriorityDefinition(userTask).get('priority')).to.eql('newValue');
        expect(extensionElements.values).to.have.length(2);
      })
    );


    it('should display literal priority as non-FEEL', inject(async function(elementRegistry, selection) {

      // given
      const userTask = elementRegistry.get('UserTask_5');

      // assume
      expect(getPriorityDefinition(userTask).get('priority')).to.eql('5');

      await act(() => {
        selection.select(userTask);
      });

      // when
      const entry = domQuery('[data-entry-id="zenbpm-assign-priority"]', container);

      // then
      expect(entry).to.exist;

      // plain input rendered (feel: 'optional' with non-'=' value)
      const plainInput = domQuery('input[name="zenbpm-assign-priority"]', entry);
      expect(plainInput).to.exist;
      expect(plainInput.value).to.eql('5');

      // no FEEL CodeMirror rendered
      const feelInput = domQuery('[role="textbox"]', entry);
      expect(feelInput).to.not.exist;
    }));


    it('should preserve literal priority on write-back', inject(async function(elementRegistry, selection) {

      // given
      const userTask = elementRegistry.get('UserTask_5');

      await act(() => {
        selection.select(userTask);
      });

      // when
      const plainInput = domQuery('input[name="zenbpm-assign-priority"]', container);
      changeInput(plainInput, '7');

      // then
      // literal preserved, no '=' prefix added
      expect(getPriorityDefinition(userTask).get('priority')).to.eql('7');
    }));


    it('should remove literal priority when cleared', inject(async function(elementRegistry, selection) {

      // given
      const userTask = elementRegistry.get('UserTask_5');

      // assume
      expect(getPriorityDefinition(userTask)).to.exist;

      await act(() => {
        selection.select(userTask);
      });

      // when
      const plainInput = domQuery('input[name="zenbpm-assign-priority"]', container);
      changeInput(plainInput, '');

      // then
      expect(getPriorityDefinition(userTask)).not.to.exist;
    }));

  });


  describe('integration', function() {

    describe('removing priority definition when empty', function() {

      it('removing zenbpm:priority', inject(async function(elementRegistry, selection) {

        // given
        const userTask = elementRegistry.get('UserTask_4');

        await act(() => {
          selection.select(userTask);
        });

        // when
        const priorityInput = domQuery('[data-entry-id="zenbpm-assign-priority"] [role="textbox"]', container);

        await setEditorValue(priorityInput, '');

        // then
        expect(getPriorityDefinition(userTask)).not.to.exist;
      }));

    });

  });

});
