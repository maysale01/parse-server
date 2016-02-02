'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = initParseServer;

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _multer = require('multer');

var _multer2 = _interopRequireDefault(_multer);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _node = require('parse/node');

var _utils = require('../utils');

var _middlewares = require('../middlewares');

var middlewares = _interopRequireWildcard(_middlewares);

var _handlers = require('./handlers');

var handlers = _interopRequireWildcard(_handlers);

var _classes = require('./classes');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// This app serves the Parse API directly.
// It's the equivalent of https://api.parse.com/1 in the hosted Parse API.

function initParseServer(args) {

    var api = (0, _express2.default)();
    var router = new _classes.PromiseRouter();

    // File handling needs to be before default middlewares are applied
    api.use('/', handlers.files.router);

    // TODO: separate this from the regular ParseServer object
    if (process.env.TESTING == 1) {
        console.log('enabling integration testingRoutes');
        api.use('/', handlers.testingRoutes.router);
    }

    api.use(_bodyParser2.default.json({ 'type': '*/*' }));
    api.use(middlewares.allowCrossDomain);
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);

    console.log(handlers);

    router.merge(handlers['classes']);
    router.merge(handlers['users']);
    router.merge(handlers['sessions']);
    router.merge(handlers['roles']);
    router.merge(handlers['analytics']);
    router.merge(handlers['push']);
    router.merge(handlers['installations']);
    router.merge(handlers['functions']);

    _utils.batch.mountOnto(router);

    router.mountOnto(api);

    api.use(middlewares.handleParseErrors);

    return api;
}
/* Externals */