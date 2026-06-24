import { expect } from 'chai';

import {
  normalizeZeebeXml,
  denormalizeToZeebeXml,
} from 'lib/util/NormalizeNamespace';


describe('util/NormalizeNamespace', function() {

  describe('normalizeZeebeXml', function() {

    it('rewrites the zeebe: element namespace to zenbpm:', function() {
      const input = '<zeebe:property name="foo" value="bar" />';
      const output = normalizeZeebeXml(input);
      expect(output).to.match(/<zenbpm:property\s/);
      expect(output).not.to.match(/<zeebe:property/);
    });


    it('rewrites the camundaModeler: name prefix to zenbpmModeler:', function() {
      const input = '<zenbpm:property name="camundaModeler:exampleOutputJson" value="{}" />';
      const output = normalizeZeebeXml(input);
      expect(output).to.match(/name="zenbpmModeler:exampleOutputJson"/);
      expect(output).not.to.match(/name="camundaModeler:/);
    });


    it('rewrites the zeebe: namespace AND the camundaModeler: prefix in the same call', function() {
      const input = '<zeebe:property name="camundaModeler:foo" value="{}" />';
      const output = normalizeZeebeXml(input);
      expect(output).to.equal('<zenbpm:property name="zenbpmModeler:foo" value="{}" />');
    });


    it('leaves non-matching names untouched', function() {
      const input = '<zenbpm:property name="role" value="admin" />';
      const output = normalizeZeebeXml(input);
      expect(output).to.equal(input);
    });
  });


  describe('denormalizeToZeebeXml', function() {

    it('rewrites the zenbpm: element namespace to zeebe:', function() {
      const input = '<zenbpm:property name="foo" value="bar" />';
      const output = denormalizeToZeebeXml(input);
      expect(output).to.match(/<zeebe:property\s/);
      expect(output).not.to.match(/<zenbpm:property/);
    });


    it('rewrites the zenbpmModeler: name prefix to camundaModeler:', function() {
      const input = '<zenbpm:property name="zenbpmModeler:exampleOutputJson" value="{}" />';
      const output = denormalizeToZeebeXml(input);
      expect(output).to.match(/name="camundaModeler:exampleOutputJson"/);
      expect(output).not.to.match(/name="zenbpmModeler:/);
    });


    it('rewrites both the namespace and the prefix in the same call', function() {
      const input = '<zenbpm:property name="zenbpmModeler:foo" value="{}" />';
      const output = denormalizeToZeebeXml(input);
      expect(output).to.equal('<zeebe:property name="camundaModeler:foo" value="{}" />');
    });


    it('is the inverse of normalizeZeebeXml for a Camunda-authored property', function() {
      const camundaInput = '<zeebe:property name="camundaModeler:exampleOutputJson" value="{&#34;abc&#34;:123}" />';
      const roundTripped = denormalizeToZeebeXml(normalizeZeebeXml(camundaInput));
      expect(roundTripped).to.equal(camundaInput);
    });
  });
});
