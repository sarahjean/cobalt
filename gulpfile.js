'use strict';

var compassOptions = require('compass-options'),
  path = require('path');

var options = {},
  compass;

// #############################
// Edit these paths and options.
// #############################

// The root paths are used to construct all the other paths in this
// configuration. The "project" root path is where this gulpfile.js is located.
// While Zen distributes this in the theme root folder, you can also put this
// (and the package.json) in your project's root folder and edit the paths
// accordingly.
options.rootPath = {
  project     : __dirname + '/',
  styleGuide  : __dirname + '/styleguide/',
  theme       : __dirname + '/'
};

// Define the paths in the Drupal theme by getting theme sub-directories from
// Compass' config.rb.
// @TODO Remove our dependency on Compass once libSass is more feature rich.
compass = compassOptions.dirs({'config': options.rootPath.theme + 'config.rb'});

options.theme = {
  root  : options.rootPath.theme,
  css   : options.rootPath.theme + compass.css + '/',
  sass  : options.rootPath.theme + compass.sass + '/',
  js    : options.rootPath.theme + compass.js + '/'
};

// Define the style guide paths and options.
options.styleGuide = {
  source: [
    options.theme.sass,
    options.theme.css + 'style-guide/'
  ],
  destination: options.rootPath.styleGuide,

  // The css and js paths are URLs, like '/misc/jquery.js'.
  // The following paths are relative to the generated style guide.
  css: [
    path.relative(options.rootPath.styleGuide, options.theme.css + 'styles.css'),
    path.relative(options.rootPath.styleGuide, options.theme.css + 'style-guide/chroma-kss-styles.css'),
    path.relative(options.rootPath.styleGuide, options.theme.css + 'style-guide/kss-only.css')
  ],
  js: [
  ],

  homepage: 'homepage.md',
  title: 'Zen 7.x-6.x Style Guide'
};

// Define the path to the project's .scss-lint.yml.
options.scssLint = {
  yml: options.rootPath.project + '.scss-lint.yml'
};

// Define the paths to the JS files to lint.
options.eslint = {
  files  : [
    options.theme.js + '**/*.js',
    '!' + options.theme.js + '**/*.min.js'
  ]
};

// If your files are on a network share, you may want to turn on polling for
// Gulp and Compass watch commands. Since polling is less efficient, we disable
// polling by default.
var enablePolling = false;
if (!enablePolling) {
  options.compassPollFlag = '';
  options.gulpWatchOptions = {};
} else {
  options.compassPollFlag = ' --poll';
  options.gulpWatchOptions = {interval: 1000, mode: 'poll'};
}

// ################################
// Load Gulp and tools we will use.
// ################################
var gulp      = require('gulp'),
  $           = require('gulp-load-plugins')(),
  del         = require('del'),
  runSequence = require('run-sequence'),
  chug        = require('gulp-chug');

// The default task.
gulp.task('default', ['build']);

// #################
// Build everything.
// #################
gulp.task('build', ['styles:production', 'styleguide'], function (cb) {
  // Run linting last, otherwise its output gets lost.
  runSequence(['lint'], cb);
});

// ##########
// Build CSS.
// ##########
gulp.task('styles', ['clean:css'], $.shell.task(
  ['bundle exec compass compile --time --sourcemap --output-style expanded'],
  {cwd: options.theme.root}
));

gulp.task('styles:production', ['clean:css'], $.shell.task(
  ['bundle exec compass compile --time --no-sourcemap --output-style compressed'],
  {cwd: options.theme.root}
));

// ##################
// Build style guide.
// ##################
var flags = [], values;
// Construct our command-line flags from the options.styleGuide object.
for (var flag in options.styleGuide) {
  if (options.styleGuide.hasOwnProperty(flag)) {
    values = options.styleGuide[flag];
    if (!Array.isArray(values)) {
      values = [values];
    }
    for (var i = 0; i < values.length; i++) {
      flags.push('--' + flag + '=\'' + values[i] + '\'');
    }
  }
}
gulp.task('styleguide', ['clean:styleguide', 'styleguide:chroma-kss-markup'], $.shell.task(
  ['kss-node <%= flags %>'],
  {templateData: {flags: flags.join(' ')}}
));

gulp.task('styleguide:chroma-kss-markup', $.shell.task(
  [
    // @TODO: mkdir and head are UNIX utils. Replace this after Chroma is refactored.
    'mkdir -p css/style-guide',
    'bundle exec sass --compass --scss --sourcemap=none --style expanded sass/style-guide/chroma-kss-markup.scss css/style-guide/chroma-kss-markup.hbs.tmp',
    'head -n 2  css/style-guide/chroma-kss-markup.hbs.tmp | tail -n 1 > css/style-guide/chroma-kss-markup.hbs',
    'rm css/style-guide/chroma-kss-markup.hbs.tmp'
  ],
  {cwd: options.theme.root}
));

// #########################
// Lint Sass and JavaScript.
// #########################
gulp.task('lint', function (cb) {
  runSequence(['lint:js', 'lint:sass'], cb);
});

// Lint JavaScript.
gulp.task('lint:js', function () {
  return gulp.src(options.eslint.files)
    .pipe($.eslint())
    .pipe($.eslint.format());
});

// Lint JavaScript and throw an error for a CI to catch.
gulp.task('lint:js-with-fail', function () {
  return gulp.src(options.eslint.files)
    .pipe($.eslint())
    .pipe($.eslint.format())
    .pipe($.eslint.failOnError());
});

// Lint Sass.
gulp.task('lint:sass', function() {
  return gulp.src(options.theme.sass + '**/*.scss')
    .pipe($.scssLint({'bundleExec': true, 'config': options.scssLint.yml}));
});

// Lint Sass and throw an error for a CI to catch.
gulp.task('lint:sass-with-fail', function() {
  return gulp.src(options.theme.sass + '**/*.scss')
    .pipe($.scssLint({'bundleExec': true, 'config': options.scssLint.yml}))
    .pipe($.scssLint.failReporter());
});

// ##############################
// Watch for changes and rebuild.
// ##############################
gulp.task('watch', ['watch:lint-and-styleguide', 'watch:js'], function (cb) {
  // Since watch:css will never return, call it last (not as dependency.)
  runSequence(['watch:css'], cb);
});

gulp.task('watch:css', ['clean:css'], $.shell.task(
  // The "watch:css" task CANNOT be used in a dependency, because this task will
  // never end as "compass watch" never completes and returns.
  ['bundle exec compass watch --time --sourcemap --output-style expanded' + options.compassPollFlag],
  {cwd: options.theme.root}
));

gulp.task('watch:lint-and-styleguide', ['styleguide', 'lint:sass'], function() {
  return gulp.watch([
      options.theme.sass + '**/*.scss',
      options.theme.sass + '**/*.hbs'
    ], options.gulpWatchOptions, ['styleguide', 'lint:sass']);
});

gulp.task('watch:js', ['lint:js'], function() {
  return gulp.watch(options.eslint.files, options.gulpWatchOptions, ['lint:js']);
});

// ######################
// Clean all directories.
// ######################
gulp.task('clean', ['clean:css', 'clean:styleguide']);

// Clean style guide files.
gulp.task('clean:styleguide', function(cb) {
  // You can use multiple globbing patterns as you would with `gulp.src`
  del([
      options.styleGuide.destination + '*.html',
      options.styleGuide.destination + 'public',
      options.theme.css + '**/*.hbs'
    ], {force: true}, cb);
});

// Clean CSS files.
gulp.task('clean:css', function(cb) {
  del([
      options.theme.root + '**/.sass-cache',
      options.theme.css + '**/*.css',
      options.theme.css + '**/*.map'
    ], {force: true}, cb);
});


// ######################
// BackstopJS testing.
// ######################

//gulp chug (BackstopJS: $ gulp start)
gulp.task( 'start', function () {
    gulp.src( './node_modules/backstopjs/gulpfile.js' )
        .pipe( chug({
        tasks:  [ 'start' ]
    }));
});
//gulp chug (BackstopJS: $ gulp reference)
gulp.task( 'reference', function () {
    gulp.src( './node_modules/backstopjs/gulpfile.js' )
        .pipe( chug({
        tasks:  [ 'reference' ]
    }));
});
//gulp chug (BackstopJS: $ gulp test)
gulp.task( 'test', function () {
    gulp.src( './node_modules/backstopjs/gulpfile.js' )
        .pipe( chug({
        tasks:  [ 'test' ]
    }));
});
//gulp chug (BackstopJS: $ gulp bless)
gulp.task( 'bless', function () {
    gulp.src( './node_modules/backstopjs/gulpfile.js' )
        .pipe( chug({
        tasks:  [ 'bless' ]
    }));
});
//gulp chug (BackstopJS: $ gulp echo)
gulp.task( 'echo', function () {
    gulp.src( './node_modules/backstopjs/gulpfile.js' )
        .pipe( chug({
        tasks:  [ 'echo' ]
    }));
});
//gulp chug (BackstopJS: $ gulp genConfig)
gulp.task( 'genConfig', function () {
    gulp.src( './node_modules/backstopjs/gulpfile.js' )
        .pipe( chug({
        tasks:  [ 'genConfig' ]
    }));
});
//gulp chug (BackstopJS: $ gulp openReport)
gulp.task( 'openReport', function () {
    gulp.src( './node_modules/backstopjs/gulpfile.js' )
        .pipe( chug({
        tasks:  [ 'openReport' ]
    }));
});


// Resources used to create this gulpfile.js:
// - https://github.com/google/web-starter-kit/blob/master/gulpfile.js
// - https://github.com/north/generator-north/blob/master/app/templates/Gulpfile.js
// - http://blog.bartos.me/css-regression-testing/
