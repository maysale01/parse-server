'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = addParseCloud;
function addParseCloud() {
  Parse.Cloud.Functions = {};
  Parse.Cloud.Triggers = {
    beforeSave: {},
    beforeDelete: {},
    afterSave: {},
    afterDelete: {}
  };
  Parse.Cloud.define = function (functionName, handler) {
    Parse.Cloud.Functions[functionName] = handler;
  };
  Parse.Cloud.beforeSave = function (parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.beforeSave[className] = handler;
  };
  Parse.Cloud.beforeDelete = function (parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.beforeDelete[className] = handler;
  };
  Parse.Cloud.afterSave = function (parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.afterSave[className] = handler;
  };
  Parse.Cloud.afterDelete = function (parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.afterDelete[className] = handler;
  };
  Parse.Cloud.httpRequest = function (options) {
    var promise = new Parse.Promise();
    var callbacks = {
      success: options.success,
      error: options.error
    };
    delete options.success;
    delete options.error;
    if (options.uri && !options.url) {
      options.uri = options.url;
      delete options.url;
    }
    if (_typeof(options.body) === 'object') {
      options.body = JSON.stringify(options.body);
    }
    request(options, function (error, response, body) {
      if (error) {
        if (callbacks.error) {
          return callbacks.error(error);
        }
        return promise.reject(error);
      } else {
        if (callbacks.success) {
          return callbacks.success(body);
        }
        return promise.resolve(body);
      }
    });
    return promise;
  };
  global.Parse = Parse;
}