const path = require('path');
const {
  DefinePlugin,
  NormalModuleReplacementPlugin
} = require('webpack');

const basePath = '.';

// configures browsers to run test against
// any of [ 'ChromeHeadless', 'Chrome', 'Firefox', 'IE', 'PhantomJS' ]
const browsers = (process.env.TEST_BROWSERS || 'ChromeHeadlessNoSandbox').split(',');

const singleStart = process.env.SINGLE_START;

const absoluteBasePath = path.resolve(path.join(__dirname, basePath));

// use puppeteer provided Chrome for testing

const suite = 'test/testBundle.ts';

// use stable timezone
process.env.TZ = 'Europe/Berlin';

module.exports = async function(karma) {
  process.env.CHROME_BIN = await require('puppeteer').executablePath();

  const config = {

    basePath,

    // pnpm's symlinked node_modules layout can defeat karma's `karma-*`
    // auto-discovery, so explicitly register the plugins we rely on.
    plugins: [
      'karma-webpack',
      'karma-mocha',
      'karma-env-preprocessor',
      'karma-chrome-launcher-2',
      'karma-coverage'
    ],

    frameworks: [
      'webpack',
      'mocha'
    ],

    files: [
      suite
    ],

    preprocessors: {
      [ suite ]: [ 'webpack', 'env' ]
    },

    reporters: [ 'progress' ],

    browsers,

    // Chrome launched via puppeteer in a container needs --no-sandbox.
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage'
        ]
      }
    },

    singleRun: true,
    autoWatch: false,

    webpack: {
      mode: 'development',
      module: {
        rules: [
          {
            test: /\.(css|bpmn)$/,
            use: 'raw-loader'
          },
          {
            test: /test\/globals\.[jt]s$/,
            sideEffects: true
          },
          {
            test: /\.m?[jt]s$/,
            exclude: /node_modules/,
            use: {
              loader: 'babel-loader',
              options: {
                presets: [
                  '@babel/preset-typescript'
                ],
                plugins: [
                  [ '@babel/plugin-transform-react-jsx', {
                    'importSource': '@bpmn-io/properties-panel/preact',
                    'runtime': 'automatic'
                  } ]
                ]
              }
            }
          }
        ]
      },
      plugins: [
        new DefinePlugin({

          // @barmac: process.env has to be defined to make @testing-library/preact work
          'process.env': {}
        }),
        new NormalModuleReplacementPlugin(
          /^preact(\/[^/]+)?$/,
          function(resource) {

            const replMap = {
              'preact/hooks': path.resolve('node_modules/@bpmn-io/properties-panel/preact/hooks/dist/hooks.module.js'),
              'preact/jsx-runtime': path.resolve('node_modules/@bpmn-io/properties-panel/preact/jsx-runtime/dist/jsxRuntime.module.js'),
              'preact': path.resolve('node_modules/@bpmn-io/properties-panel/preact/dist/preact.module.js')
            };

            const replacement = replMap[resource.request];

            if (!replacement) {
              return;
            }

            resource.request = replacement;
          }
        ),
        new NormalModuleReplacementPlugin(
          /^preact\/hooks/,
          path.resolve('node_modules/@bpmn-io/properties-panel/preact/hooks/dist/hooks.module.js')
        )
      ],
      resolve: {
        extensions: ['.js', '.ts', '.tsx', '.json'],
        mainFields: [
          'browser',
          'module',
          'main'
        ],
        alias: {
          'preact': '@bpmn-io/properties-panel/preact',
          'react': '@bpmn-io/properties-panel/preact/compat',
          'react-dom': '@bpmn-io/properties-panel/preact/compat'
        },
        modules: [
          'node_modules',
          absoluteBasePath
        ]
      },
      devtool: 'eval-source-map'
    }
  };

  if (singleStart) {
    config.browsers = [].concat(config.browsers, 'Debug');
    config.envPreprocessor = [].concat(config.envPreprocessor || [], 'SINGLE_START');
  }

  karma.set(config);
};
