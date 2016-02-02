'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = addParseCloud;

var _node = require('parse/node');

var _getClassName = require('./getClassName');

var _getClassName2 = _interopRequireDefault(_getClassName);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function addParseCloud() {
    _node.Parse.Cloud.Functions = {};
    _node.Parse.Cloud.Triggers = {
        beforeSave: {},
        beforeDelete: {},
        afterSave: {},
        afterDelete: {}
    };
    _node.Parse.Cloud.define = function (functionName, handler) {
        _node.Parse.Cloud.Functions[functionName] = handler;
    };
    _node.Parse.Cloud.beforeSave = function (parseClass, handler) {
        var className = (0, _getClassName2.default)(parseClass);
        _node.Parse.Cloud.Triggers.beforeSave[className] = handler;
    };
    _node.Parse.Cloud.beforeDelete = function (parseClass, handler) {
        var className = (0, _getClassName2.default)(parseClass);
        _node.Parse.Cloud.Triggers.beforeDelete[className] = handler;
    };
    _node.Parse.Cloud.afterSave = function (parseClass, handler) {
        var className = (0, _getClassName2.default)(parseClass);
        _node.Parse.Cloud.Triggers.afterSave[className] = handler;
    };
    _node.Parse.Cloud.afterDelete = function (parseClass, handler) {
        var className = (0, _getClassName2.default)(parseClass);
        _node.Parse.Cloud.Triggers.afterDelete[className] = handler;
    };
    _node.Parse.Cloud.httpRequest = function (options) {
        var promise = new _node.Parse.Promise();
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
        (0, _request2.default)(options, function (error, response, body) {
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
    global.Parse = _node.Parse;
}