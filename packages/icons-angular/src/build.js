/**
 * Copyright IBM Corp. 2018, 2018
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

const icons = require('@carbon/icons/meta.json');
const { toString } = require('@carbon/icon-helpers');
const { reporter } = require('@carbon/cli-reporter');
const fs = require('fs-extra');
const { join, dirname, resolve } = require('path');
const { param } = require('change-case');
const ngc = require('@angular/compiler-cli/src/main');
const { rollup } = require('rollup');
const {
  componentTemplate,
  moduleTemplate,
  indexTemplate,
  storyTemplate,
} = require('./templates');
const clean = require('./clean');
const paths = require('./paths');

async function generateComponents() {
  // loop through the icons meta array
  for (const icon of icons) {
    const className = icon.moduleName;
    const selectorName = param(icon.moduleName);
    const rawSvg = toString(icon.descriptor);
    const dirExists = await fs.exists(join(paths.TS, icon.basename));
    const outputPath = icon.outputOptions.file
      .replace('es', 'ts')
      .replace('.js', '.ts');
    // try to write out the component
    try {
      if (!dirExists) {
        await fs.ensureDir(dirname(outputPath));
      }
      await fs.writeFile(
        outputPath,
        componentTemplate(
          selectorName,
          className,
          rawSvg,
          icon.descriptor.attrs
        )
      );
    } catch (err) {
      reporter.error(err);
    }
  }
  // write out the module
  try {
    await fs.writeFile(join(paths.TS, 'IconModule.ts'), moduleTemplate(icons));
    await fs.writeFile(join(paths.TS, 'index.ts'), indexTemplate());
  } catch (err) {
    reporter.log(err);
  }
}

async function buildUMD() {
  const bundle = await rollup({
    input: join(paths.LIB, 'index.js'),
    external: ['@angular/core', '@carbon/icon-helpers'],
  });

  await bundle.write({
    name: 'CarbonIconsAngular',
    format: 'umd',
    file: join(paths.UMD, 'index.js'),
    globals: {
      '@carbon/icon-helpers': 'CarbonIconHelpers',
      '@angular/core': 'ng.Core',
    },
  });

  for (const icon of icons) {
    const jsSource = icon.outputOptions.file.replace('es', 'lib');
    const iconbundle = await rollup({
      input: jsSource,
      external: ['@angular/core', '@carbon/icon-helpers'],
      cache: false,
    });

    const jsOutput = jsSource.replace('lib', 'umd');
    await iconbundle.write({
      name: 'CarbonIconsAngular',
      format: 'umd',
      file: jsOutput,
      globals: {
        '@carbon/icon-helpers': 'CarbonIconHelpers',
        '@angular/core': 'ng.Core',
      },
    });
  }
}

async function buildExamples() {
  await fs.copy(paths.LIB, paths.EXAMPLES_LIB);
  const grouped = new Map();
  for (const icon of icons) {
    if (!grouped.has(icon.basename)) {
      grouped.set(icon.basename, []);
    }
    grouped.get(icon.basename).push(icon);
  }
  let filesToWrite = [];
  for (const [basename, icons] of grouped) {
    filesToWrite.push(
      fs.writeFile(
        `${paths.STORIES}/${basename}.stories.ts`,
        storyTemplate(basename, icons)
      )
    );
  }
  await Promise.all(filesToWrite);
}

async function build() {
  reporter.log('Cleaning build dirs...');
  try {
    await clean();

    await Promise.all([fs.mkdir(paths.STORIES), fs.mkdir(paths.TS)]);
  } catch (err) {
    reporter.error(err);
  }
  reporter.log('Generating source components...');
  await generateComponents();
  reporter.log('Compiling and generating modules...');
  // run the angular compiler over everything
  ngc.main(['-p', './config/tsconfig-aot.json']);
  reporter.log('Bundling...');
  await buildUMD();
  // build the storybook examples
  reporter.log('Generating storybook examples...');
  buildExamples();
}

module.exports = build;
