import './globals';

const allTests = require.context('.', true, /\.spec\.ts$/);

allTests.keys().forEach(allTests);
