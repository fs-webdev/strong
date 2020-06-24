/*!
 * Strong i18n for express - Simple Backend
 * Copyright(c) 2011 Tim Shadel
 * MIT Licensed
 */

/* 
  Simple implementation of a translation backend provider.
  Conforms to the basic strong provider API contract.
*/


/**
 * Module dependencies.
 */
const util = require('util')
const glob = util.promisify(require('glob'));
const resolve = require('path').resolve
const _ = require('underscore')
const fs = require('fs')
const readFile = util.promisify(fs.readFile)

/**
 * Expose `back`.
 */

var back = module.exports;

var exists = function (obj) {
  return ("undefined" !== typeof obj && obj !== null);
};


/**
 * API proto.
 */

back._translations = {};
back.translations_load_path = ['./locales'];

back.navigate = function (path) {
  try {
    return path.split('.').reduce(function (obj, key) { return obj[key] }, back._translations);
  } catch (e) {
    return undefined;
  }
};

back.acceptable = function (locales) {
  for (var i = 0; i < locales.length; i++) {
    var locale = locales[i];
    if (back._translations[locale]) return locale;
  };
  return false;
};

back.putAtPath = function (path, value) {
  var keypath = path.split('.');
  var key = keypath.pop();

  var self = back;
  var putPoint = keypath.reduce(
    function (obj, i) {
      var result = obj[i];
      if (typeof result === "undefined" || result === null) obj[i] = {};
      return obj[i]
    }
    , self._translations);

  putPoint[key] = value;
};

function merge(a, b) {
  if (a && b) {
    for (var key in b) {
      a[key] = b[key];
    }
  }
  return a;
};

back.mergeAtPath = function (path, object) {
  var self = back;
  var mergePoint = path.split('.').reduce(
    function (obj, i) {
      var result = obj[i];
      if (typeof result === "undefined" || result === null) obj[i] = {};
      return obj[i]
    }
    , self._translations);

  merge(mergePoint, object);
};


/**
 * Initialize the api using the provided backend implementation.
 *
 * @api private
 */

back.init = async function (options) {
  // console.trace('~~~ async init', options)
  // Initialize our backing store with no translations.
  this._translations = {};
  if (typeof options !== "undefined" && options !== null) {
    if (typeof options["translations_dir"] !== "undefined" && options["translations_dir"] !== null) {
      this.translations_load_path.push(options["translations_dir"]);
    } else if (typeof options["translations_load_path"] !== "undefined" && options["translations_load_path"] !== null) {
      this.translations_load_path = options["translations_load_path"];
    }
  }

  try {
    // Load find the list of translation files available
    const results = await this.load()
    console.log('~~~ done loading translations', results.length)
    return results
  } catch (err) {
    console.log("Problem loading translations: " + err);
  }

};

back.load = async function () {
  return Promise.all(this.resolvePaths().map(async ([path, namespace]) => {
    console.log('~~~ path namespace', path, namespace)
    // Make sure it's either an absolute path or if it's relative, go from cwd
    var absPath = resolve(process.cwd(), path);

    var pattern = '' + absPath + '/**/*.+(js|json|coffee)';
    var self = back;

    const matches = await glob(pattern, { follow: true });
    // Load the file into the _translations hash
    console.log('~~~ loading strong async matches', matches)
    return Promise.all(matches.map(match => self.loadTranslationFile(match, path, namespace)))
  }))

  return promises.all(promises)
}

back.eachLoadPath = function (callback) {
  for (var i = 0; i < this.translations_load_path.length; i++) {
    var path_item = this.translations_load_path[i];
    if ('string' === typeof path_item) {
      callback(path_item, null);
    } else {
      for (var namespace in path_item) {
        callback(path_item[namespace], namespace);
      }
    }
  }
};

back.resolvePaths = function () {
  const paths = []
  for (var i = 0; i < this.translations_load_path.length; i++) {
    var path_item = this.translations_load_path[i];
    if ('string' === typeof path_item) {
      paths.push([path_item, null]);
    } else {
      for (var namespace in path_item) {
        paths.push([path_item[namespace], namespace]);
      }
    }
  }
  return paths
};


back.toDotPath = function (filename, prefix, namespace) {
  var extractor = new RegExp("^" + prefix + "\/(.+)_([^_]+)\\.js(on)?$");
  var match = filename.match(extractor);
  if (match) {
    var replacement = '$2/$1';
    if (exists(namespace)) {
      replacement = '$2/' + namespace + '/$1';
    }
    return filename.replace(extractor, replacement).replace(/\//g, '.');
  }

  return filename;
}

/**
 * Load the contents of the given file and mount them into the
 * appropriate spot in the `_translations` hash.
 *
 * @api private
 */

back.loadTranslationFile = async function (filename, prefix, namespace) {
  try {
    // console.log('~~~ loading translation file', filename)
    const contents = JSON.parse(await readFile(filename))
    console.log('~~~ loaded translation file', filename, Object.keys(contents).length)
    const dotPath = this.toDotPath(filename, prefix, namespace);
    this.mergeAtPath(dotPath, contents);
    // console.log('load returning', filename, this._translations)
    return [filename, contents]
  } catch (e) {
    console.log('Error reading \'' + filename + '\': ' + e);
    return;
  }
};

/**
 * Load utility functions into scope.
 */
require('./util');
