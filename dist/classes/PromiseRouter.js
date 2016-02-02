'use strict';

// A router that is based on promises rather than req/res/next.
// This is intended to replace the use of express.Router to handle
// subsections of the API surface.
// This will make it easier to have methods like 'batch' that
// themselves use our routing information, without disturbing express
// components that external developers may be modifying.

function PromiseRouter() {
  // Each entry should be an object with:
  // path: the path to route, in express format
  // method: the HTTP method that this route handles.
  //   Must be one of: POST, GET, PUT, DELETE
  // handler: a function that takes request, and returns a promise.
  //   Successful handlers should resolve to an object with fields:
  //     status: optional. the http status code. defaults to 200
  //     response: a json object with the content of the response
  //     location: optional. a location header
  this.routes = [];
}

// Global flag. Set this to true to log every request and response.
PromiseRouter.verbose = process.env.VERBOSE || false;

// Merge the routes into this one
PromiseRouter.prototype.merge = function (router) {
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = router.routes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var route = _step.value;

      this.routes.push(route);
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }
};

PromiseRouter.prototype.route = function (method, path, handler) {
  switch (method) {
    case 'POST':
    case 'GET':
    case 'PUT':
    case 'DELETE':
      break;
    default:
      throw 'cannot route method: ' + method;
  }

  this.routes.push({
    path: path,
    method: method,
    handler: handler
  });
};

// Returns an object with:
//   handler: the handler that should deal with this request
//   params: any :-params that got parsed from the path
// Returns undefined if there is no match.
PromiseRouter.prototype.match = function (method, path) {
  var _iteratorNormalCompletion2 = true;
  var _didIteratorError2 = false;
  var _iteratorError2 = undefined;

  try {
    for (var _iterator2 = this.routes[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      var route = _step2.value;

      if (route.method != method) {
        continue;
      }

      // NOTE: we can only route the specific wildcards :className and
      // :objectId, and in that order.
      // This is pretty hacky but I don't want to rebuild the entire
      // express route matcher. Maybe there's a way to reuse its logic.
      var pattern = '^' + route.path + '$';

      pattern = pattern.replace(':className', '(_?[A-Za-z][A-Za-z_0-9]*)');
      pattern = pattern.replace(':objectId', '([A-Za-z0-9]+)');
      var re = new RegExp(pattern);
      var m = path.match(re);
      if (!m) {
        continue;
      }
      var params = {};
      if (m[1]) {
        params.className = m[1];
      }
      if (m[2]) {
        params.objectId = m[2];
      }

      return { params: params, handler: route.handler };
    }
  } catch (err) {
    _didIteratorError2 = true;
    _iteratorError2 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion2 && _iterator2.return) {
        _iterator2.return();
      }
    } finally {
      if (_didIteratorError2) {
        throw _iteratorError2;
      }
    }
  }
};

// A helper function to make an express handler out of a a promise
// handler.
// Express handlers should never throw; if a promise handler throws we
// just treat it like it resolved to an error.
function makeExpressHandler(promiseHandler) {
  return function (req, res, next) {
    try {
      if (PromiseRouter.verbose) {
        console.log(req.method, req.originalUrl, req.headers, JSON.stringify(req.body, null, 2));
      }
      promiseHandler(req).then(function (result) {
        if (!result.response) {
          console.log('BUG: the handler did not include a "response" field');
          throw 'control should not get here';
        }
        if (PromiseRouter.verbose) {
          console.log('response:', JSON.stringify(result.response, null, 2));
        }
        var status = result.status || 200;
        res.status(status);
        if (result.location) {
          res.set('Location', result.location);
        }
        res.json(result.response);
      }, function (e) {
        if (PromiseRouter.verbose) {
          console.log('error:', e);
        }
        next(e);
      });
    } catch (e) {
      if (PromiseRouter.verbose) {
        console.log('error:', e);
      }
      next(e);
    }
  };
}

// Mount the routes on this router onto an express app (or express router)
PromiseRouter.prototype.mountOnto = function (expressApp) {
  var _iteratorNormalCompletion3 = true;
  var _didIteratorError3 = false;
  var _iteratorError3 = undefined;

  try {
    for (var _iterator3 = this.routes[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
      var route = _step3.value;

      switch (route.method) {
        case 'POST':
          expressApp.post(route.path, makeExpressHandler(route.handler));
          break;
        case 'GET':
          expressApp.get(route.path, makeExpressHandler(route.handler));
          break;
        case 'PUT':
          expressApp.put(route.path, makeExpressHandler(route.handler));
          break;
        case 'DELETE':
          expressApp.delete(route.path, makeExpressHandler(route.handler));
          break;
        default:
          throw 'unexpected code branch';
      }
    }
  } catch (err) {
    _didIteratorError3 = true;
    _iteratorError3 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion3 && _iterator3.return) {
        _iterator3.return();
      }
    } finally {
      if (_didIteratorError3) {
        throw _iteratorError3;
      }
    }
  }
};

module.exports = PromiseRouter;