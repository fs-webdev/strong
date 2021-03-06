/*!
 * Strong i18n for express - API
 * Copyright(c) 2011 Tim Shadel
 * MIT Licensed
 */

 /*
    You use keys to access translations.
    Keys are prefixed by their view's path (dot-separated).
    Globally available keys have no view path.
    Each language has a tree of view paths with their own key, value pairs at the leaves.
 */

/**
 * Module dependencies.
 */

/**
 * Expose `StrongAPI`.
 */

var api = module.exports;

var plural = require('./strong-pluralization'),
    _ = require('underscore');

var exists = function(obj) {
  return ("undefined" !== typeof obj && obj !== null);
};

var cleanUpPath = function(path) {
  if(!Array.isArray(path)) {
    return path;
  }

  var cleanPath = [];
  for(var i=0; i<path.length; ++i) {
    if(path[i] === '..') {
      cleanPath.pop();
    } else if(path[i] === '.' || path[i] === '') {
      //ignore this
    } else {
      cleanPath.push(path[i]);
    }
  }

  return cleanPath;
};

var TranslationNotFoundError = function (key, attempted) {
  return new Error("TranslationNotFound: Could not find key '" + key + "'.  Attempted: '" + attempted.map(function(e){ return e.join('.') }).join("', '") + "'");
};

/**
 * Initialize the api using the provided backend implementation.
 *
 * @api private
 */

api.init = function() {
  var self = this;

  // The default locale has a default value of 'en'.
  this._default_locale = 'en';

  // Create a virtual property for `default_locale` which allows
  // the value to be conveniently set and retrieved.
  this.__defineGetter__('default_locale', function() {
    return self._default_locale;
  });
  this.__defineSetter__('default_locale', function(new_default_locale) {
    if (exists(new_default_locale)) {
      new_default_locale = new_default_locale.toLowerCase()
    }
    self._default_locale = new_default_locale;
  });

  // Create a virtual property for `locale` which will return the most
  // recent value of `default_locale` until `locale` is specifically set.
  this._locale = undefined;
  this.__defineGetter__('locale', function() {
    return (typeof self._locale === "undefined" || self._locale === null) ? [ self._default_locale ] : self._locale;
  });
  this.__defineSetter__('locale', function(locale) {
    self._locale = locale;
  });

  if (this.hasOwnProperty('back')) {
    self.back.init();
  }
};

api.lookup = function(locale, path, key) {
  var attempts = [];
  var template;

  path = cleanUpPath(path);

  if (locale[0] === 'ke') {
    return '[' + key + ']';
  }

  if (locale[0] === 'zz') {
    return '[' + (path || []).concat(key).join('.') + ']';
  }

  for (var i = 0; i < locale.length; i++) {
    var currentLocale = locale[i];

    var context = exists(path) ? path.slice(0) : [];
    context.unshift(currentLocale);
    context.push(key);

    while (context.length > 1 && !exists(template)) {
      template = this.back.navigate(context.join('.'));
      attempts.push( context.slice(0) );
      context.splice(1, 1);
    }
    if (exists(template)) {
      break;
    }
  }
  if (!exists(template)) {
    console.log("I18N EXCEPTION: Key = " + key + "; path = " + path + "; locale = " + locale + ".");
    var e = TranslationNotFoundError(key, attempts);
    if (process.env.NODE_ENV === 'production') {
      console.log(e.message);
      template = key;
    } else {
      throw e;
    }
  }

  return template;
};

/**
 * Find an acceptable locale
 * It will return the first lower-cased locale that contains any translations
 */
api.acceptable = function() {
  return this.back.acceptable(this.effective_locale({}));
};

/**
 * Retrieve the string associated with the given key in the effective locale.
 *
 * @param {String} key
 * @param {Object} options
 * @return {String} value for that key in the appropriate locale
 * @api public
 */

api.translate = function(key, options) {
  // Provide an empty options object if none was given.
  if (options == null) options = {};

  var locale = this.effective_locale(options);
  var template = this.lookup(locale, options.view_path, key);
  if (typeof template === 'object' && typeof options["count"] === 'number') {
    var category = plural.category(locale, options.count);
    template = template[category];
  }
  return template.supplant(options);
};


/**
 * Determine the effective locale for this request. This will return an array of locales in preferred order.
 * The locale can be specified either globally by setting `api.default_locale`, by
 * setting `api.locale`, or by setting the `locale` property on the
 * `options` object passed into this method.
 *
 * @param {Object} options
 * @api private
 */

api.effective_locale = function(options) {
  var locale;

  // Use the locale from the provided options (if a valid object) as our first choice.
  if ( exists(options) ) locale = options["locale"];

  // If that didn't work, then ask for the current locale and trust that
  // we'll get back either the explicitly defined locale or the default_locale.
  if ( !exists(locale) ) locale = this.locale;

  // standardize the locale into an array of locales in preferred order
  // convert to an array if not already
  if (!_.isArray(locale)) {
    locale = [locale];
  }
  // lower case all entries
  locale = _.map(locale, function(localeString){
    return localeString.toLowerCase();
  });
  // add default locale at the end
  if (exists(this._default_locale)) {
    locale.push(this._default_locale);
  }
  // add 2 letter fallbacks
  locale = _.flatten(_.map(locale, function(value, index, list){
    if (value && value.length > 2) {
      return [ value, value.substring(0, 2) ];
    } else {
      return value;
    }
  }));
  // and remove duplicates
  locale = _.uniq(locale);

  return locale;
};


/**
 * Wrap the given Express template engine so we can later automatically extract
 * the view path from the file's location relative to the view root.
 *
 * @param {Object} Express template engine
 * @param {String} application name
 * @api public
 */

api.decorator = function(engine, appname) {
  var self = this;
  return {
    compile: function (template, options) {
      var template = engine.compile(template, options);

      // TODO: this is bad for 1) appname and 2) hacky effective_root thing in another place for a workaround...
      var effective_root = exists(options.actual_root) ? options.actual_root : options.root;
      var extractPathExpression = new RegExp("^" + effective_root + "\/(.*)\\.[^\\.]*$");
      var view_path = options.filename.replace(extractPathExpression, '$1').replace(/\/\//,'\/').split('/');
      if (exists(appname)) {
        view_path.unshift(appname);
      }
      // Define the function once per view_path, then use in all later invocations
      var translation_helper = function(key, options) {
        if ( !exists(options) ) options = {};
        options.view_path = view_path;
        // use locals.locale from view if available and not specified in options
        if (!options.locale && this.locale) {
          options.locale = this.locale;
        }
        return self.translate.apply(self, [key, options]);
      };

      var acceptedLanguage = self.acceptable.apply(self);

      return function(data) {
        data.t = data.i18n = translation_helper;
        data.i18n.acceptedLanguage = acceptedLanguage;
        return template(data);
      }
    },

    //Express 3 compliance - just render the stuff
    //emulates ejs.render(). Allows i18n() and t() to be attached and then calls ejs.renderFile()
    //@return - Returns the rendered html as a string
    render: function (template, options) {
      // TODO: this is bad for 1) appname and 2) hacky effective_root thing in another place for a workaround...
      //get the effective view_path (including if views is array) (getting directory, so we can extract filename below)
      var path = options.filename; //since we don't pass in the path, we can pull it from this



      if (options.settings.views instanceof Array) {
        options.settings.views.forEach(function(el) {
          //if it matches the path, return it
          if (path.match(el)) options.actual_root = el;
        });
      }
      var effective_root = exists(options.actual_root) ? options.actual_root : options.root;
      var extractPathExpression = new RegExp("^" + effective_root + "\/(.*)\\.[^\\.]*$");
      var view_path = path.replace(extractPathExpression, '$1').replace(/\/\//,'\/').split('/');

      if (exists(appname)) {
        view_path.unshift(appname);
      }
      // console.log("before:view_path", view_path);
      // Define the function once per view_path, then use in all later invocations
      var translation_helper = function(key, options) {

        if ( !exists(options) ) options = {};

        options.view_path = view_path;
        // use locals.locale from view if available and not specified in options
        if (!options.locale && this.locale) {
          options.locale = this.locale;
        }


        return self.translate.apply(self, [key, options]);
      };

      var acceptedLanguage = self.acceptable.apply(self);


      //attach i18n, t, etc to res.locals
      options.t = options.i18n = translation_helper;
      options.i18n.acceptedLanguage = acceptedLanguage;
      return engine.render(template, options); //return since no I/O.
    },

    //emulates ejs.renderFile(). Allows i18n() and t() to be attached and then calls ejs.renderFile()
    //same logic as render() except that it calls a different ejs function at the.
    //TODO: Clean that up... - Callback since this includes I/O
    renderFile: function (path, options, cb) {

      // TODO: this is bad for 1) appname and 2) hacky effective_root thing in another place for a workaround...
      //get the effective view_path (including if views is array) (getting directory, so we can extract filename below)
      if (options.settings.views instanceof Array) {
        options.settings.views.forEach(function(el) {
          //if it matches the path, return it
          if (path.match(el)) options.actual_root = el;
        });
      }
      var effective_root = exists(options.actual_root) ? options.actual_root : options.root;
      var extractPathExpression = new RegExp("^" + effective_root + "\/(.*)\\.[^\\.]*$");
      var view_path = path.replace(extractPathExpression, '$1').replace(/\/\//,'\/').split('/');

      if (exists(appname)) {
        view_path.unshift(appname);
      }
      // Define the function once per view_path, then use in all later invocations
      var translation_helper = function(key, options) {
        if ( !exists(options) ) options = {};

        options.view_path = view_path;
        // use locals.locale from view if available and not specified in options
        if (!options.locale && this.locale) {
          options.locale = this.locale;
        }

        return self.translate.apply(self, [key, options]);
      };

      var acceptedLanguage = self.acceptable.apply(self);

      //attach i18n, t, etc to res.locals
      options.t = options.i18n = translation_helper;
      options.i18n.acceptedLanguage = acceptedLanguage;

      //defaults to ejs. Expects to have this...
      engine.renderFile(path, options, cb);
    }
  };
};

/**
 * An optional Express middleware that reads the Accept-Language header and puts
 * the locale in res.locals.locale for use in the template
 * In Express 3 this just puts req.acceptedLanguages in res.locals.locale
 * usage:
 * app.dynamicHelpers({
 *   locale: strong.localeHelper
 * });
 *
 * @api public
 */

api.localeHelper = function(req, res) {
  var locale;
  // Express 3
  if (req.acceptedLanguages) {
    locale = req.acceptedLanguages;
  } else {
    // Express 2
    // parsing code from https://github.com/mashpie/i18n-node/blob/master/i18n.js until we switch to Express 3
    var language_header = req.headers['accept-language'],
        languages = [];

    if (language_header) {
      language_header.split(',').forEach(function (l) {
        header = l.split(';', 1)[0];
        if (header) {
          languages.push(header);
        }
      });
    }
    if (languages.length > 0) {
      locale = languages;
    }
  }

  return locale;
};

/**
* Load utility functions into scope.
*/
require('./util');
