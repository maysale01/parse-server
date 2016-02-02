// analytics.js
var Parse           = require('parse/node').Parse;
var PromiseRouter   = require('../classes/PromiseRouter');
var rest            = require('../utils/rest');

var router = new PromiseRouter();


// Returns a promise that resolves to an empty object response
function ignoreAndSucceed(req) {
    return Promise.resolve({
        response: {}
    });
}

router.route('POST','/events/AppOpened', ignoreAndSucceed);
router.route('POST','/events/:eventName', ignoreAndSucceed);

module.exports = router;