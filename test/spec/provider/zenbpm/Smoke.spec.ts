import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import {
  act
} from '@testing-library/preact';

import {
  bootstrapZenBpmPropertiesPanel,
  inject
} from 'test/TestHelper';

import {
  query as domQuery
} from 'min-dom';

import diagramXML from './fixtures/Smoke.bpmn';


describe('provider/zenbpm - smoke', function() {

  let container;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML));


  it('should render assignment group with assignee value', inject(async function(elementRegistry, selection) {

    // given
    const userTask = elementRegistry.get('UserTask_1');

    // when
    await act(() => {
      selection.select(userTask);
    });

    // then
    // the assignment group is rendered
    const assignmentGroup = domQuery('[data-group-id="group-zenbpm-assignmentDefinition"]', container);
    expect(assignmentGroup, 'assignment group').to.exist;

    // the assignee entry exists and shows the value `bob`
    const assigneeEntry = domQuery('[data-entry-id="zenbpm-assign-assignee"]', container);
    expect(assigneeEntry, 'assignee entry').to.exist;

    const textbox = domQuery('[role="textbox"]', assigneeEntry);
    expect(textbox, 'assignee textbox').to.exist;
    expect(textbox.textContent).to.equal('bob');
  }));

});
