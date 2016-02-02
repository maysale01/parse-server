'use strict';

// push.js

var Parse = require('parse/node').Parse;
var PromiseRouter = require('../classes/PromiseRouter');
var rest = require('../utils/rest');

var router = new PromiseRouter();

function notImplementedYet(req) {
    throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, 'This path is not implemented yet.');
}

router.route('POST', '/push', notImplementedYet);

module.exports = router;