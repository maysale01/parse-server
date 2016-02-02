'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseServer = exports.default = exports.Classes = exports.Adapters = exports.Middlewares = exports.Handlers = exports.Utils = undefined;

var _classes = require('./classes');

Object.defineProperty(exports, 'default', {
  enumerable: true,
  get: function get() {
    return _classes.ParseServer;
  }
});
Object.defineProperty(exports, 'ParseServer', {
  enumerable: true,
  get: function get() {
    return _classes.ParseServer;
  }
});

var _utils = require('./utils');

var utils = _interopRequireWildcard(_utils);

var _handlers = require('./handlers');

var handlers = _interopRequireWildcard(_handlers);

var _middlewares = require('./middlewares');

var middlewares = _interopRequireWildcard(_middlewares);

var _adapters = require('./adapters');

var adapters = _interopRequireWildcard(_adapters);

var classes = _interopRequireWildcard(_classes);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var Utils = exports.Utils = utils; // ParseServer - open-source compatible API Server for Parse apps

var Handlers = exports.Handlers = handlers;
var Middlewares = exports.Middlewares = Middlewares;
var Adapters = exports.Adapters = adapters;
var Classes = exports.Classes = classes;