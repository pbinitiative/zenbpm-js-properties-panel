'use strict';

var bpmnJsPropertiesPanel = require('bpmn-js-properties-panel');

var n,l,u,s=[];function y(l,u,t){var i,o,r,f={};for(r in u)"key"==r?i=u[r]:"ref"==r?o=u[r]:f[r]=u[r];if(arguments.length>2&&(f.children=arguments.length>3?n.call(arguments,2):t),"function"==typeof l&&null!=l.defaultProps)for(r in l.defaultProps) void 0===f[r]&&(f[r]=l.defaultProps[r]);return d(l,f,i,o,null)}function d(n,t,i,o,r){var f={type:n,props:t,key:i,ref:o,__k:null,__:null,__b:0,__e:null,__d:void 0,__c:null,constructor:void 0,__v:null==r?++u:r,__i:-1,__u:0};return null!=l.vnode&&l.vnode(f),f}n=s.slice,l={__e:function(n,l,u,t){for(var i,o,r;l=l.__;)if((i=l.__c)&&!i.__)try{if((o=i.constructor)&&null!=o.getDerivedStateFromError&&(i.setState(o.getDerivedStateFromError(n)),r=i.__d),null!=i.componentDidCatch&&(i.componentDidCatch(n,t||{}),r=i.__d),r)return i.__E=i}catch(l){n=l;}throw n}},u=0,"function"==typeof Promise?Promise.prototype.then.bind(Promise.resolve()):setTimeout;

function ZenFormProps(element) {
    if (element.type !== 'bpmn:UserTask') {
        return [];
    }
    return [
        {
            id: 'zenFormDesignButton',
            component: ZenFormDesignButtonEntry,
            isEdited: () => false,
        }
    ];
}
function getZenFormValue(element) {
    const bo = element.businessObject;
    const extensionElements = bo.extensionElements;
    if (!extensionElements)
        return '';
    const ioMapping = extensionElements.values?.find((e) => e.$type === 'zenbpm:IoMapping');
    if (!ioMapping)
        return '';
    const input = (ioMapping.inputParameters || []).find((p) => p.target === 'ZEN_FORM');
    if (!input?.source)
        return '';
    // Parse FEEL string literal: ="..." → raw JSON
    const src = input.source;
    if (src.startsWith('="') && src.endsWith('"')) {
        return src.slice(2, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return src;
}
function ZenFormDesignButtonEntry(props) {
    const { element } = props;
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const handleClick = () => {
        const currentValue = getZenFormValue(element);
        document.dispatchEvent(new CustomEvent('bpmn-open-form-designer', {
            detail: { elementId: element.id, value: currentValue },
        }));
    };
    return y('div', { class: 'bio-properties-panel-entry', style: 'padding: 0 10px 6px' }, y('button', {
        type: 'button',
        onClick: handleClick,
        style: 'width: 100%; padding: 6px 12px; cursor: pointer; ' +
            'background: #4d90fe; color: white; border: none; border-radius: 3px; ' +
            'font-size: 13px; font-weight: 500;',
    }, translate('Design Form')));
}

class ZenBpmPropertiesProvider {
    static $inject = ['propertiesPanel'];
    constructor(propertiesPanel) {
        propertiesPanel.registerProvider(500, this);
    }
    getGroups(element) {
        return function (groups) {
            if (element.type === 'bpmn:UserTask') {
                groups.push({
                    id: 'zenbpm-form',
                    label: 'Zen Form',
                    entries: ZenFormProps(element),
                });
            }
            return groups;
        };
    }
}

var index = {
    __init__: ['zenbpmPropertiesProvider'],
    zenbpmPropertiesProvider: ['type', ZenBpmPropertiesProvider]
};

exports.ZenBpmPropertiesProviderModule = index;
//# sourceMappingURL=index.cjs.map
