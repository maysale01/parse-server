"use strict";
require("babel-polyfill");

// A router that is based on promises rather than req/res/next.
// This is intended to replace the use of express.Router to handle
// subsections of the API surface.
// This will make it easier to have methods like 'batch' that
// themselves use our routing information, without disturbing express
// components that external developers may be modifying.

class PromiseRouter {
    constructor(verbose) {
        // Each entry should be an object with:
        // path: the path to route, in express format
        // method: the HTTP method that this route handles.
        //   Must be one of: POST, GET, PUT, DELETE
        // handler: a function that takes request, and returns a promise.
        //   Successful handlers should resolve to an object with fields:
        //     status: optional. the http status code. defaults to 200
        //     response: a json object with the content of the response
        //     location: optional. a location header
        this._routes = [];
    }

    static get verbose () {
        if (this._verbose === 'undefined') {
            this._verbose = false;
        }

        return this._verbose;
    }

    static set verbose (value) {
        this._verbose = value;
    }

    get routes() {
        return this._routes;
    }

    get verbose() {
        return this._verbose;
    }

    set routes(value) {
        this._routes = value;
    }

    set verbose(value) {
        this._verbose = value;
    }

    // Merge the routes into this one
    merge(router) {
        for (let route of router.routes) {
            this.routes.push(route);
        }
    }

    route(method, path, handler) {
        switch(method) {
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
    }


    // Returns an object with:
    //   handler: the handler that should deal with this request
    //   params: any :-params that got parsed from the path
    // Returns undefined if there is no match.
    match(method, path) {

        for (let route of this.routes) {
            if (route.method != method) {
                continue;
            }

            // NOTE: we can only route the specific wildcards :className and
            // :objectId, and in that order.
            // This is pretty hacky but I don't want to rebuild the entire
            // express route matcher. Maybe there's a way to reuse its logic.
            let pattern = '^' + route.path + '$';

            pattern = pattern.replace(':className',
                                  '(_?[A-Za-z][A-Za-z_0-9]*)');
            pattern = pattern.replace(':objectId',
                                  '([A-Za-z0-9]+)');
            let re = new RegExp(pattern);
            let m = path.match(re);
            if (!m) {
                continue;
            }
            let params = {};
            if (m[1]) {
                params.className = m[1];
            }
            if (m[2]) {
                params.objectId = m[2];
            }

            return {params: params, handler: route.handler};
        }
    }

    // Mount the routes on this router onto an express app (or express router)
    mountOnto(expressApp) {
        for (let route of this.routes) {
            switch(route.method) {
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
    }
}


// A helper function to make an express handler out of a a promise
// handler.
// Express handlers should never throw; if a promise handler throws we
// just treat it like it resolved to an error.
export function makeExpressHandler(promiseHandler) {
    return async function(req, res, next) {
        try {
            if (PromiseRouter.verbose) {
                console.log(req.method, req.originalUrl, req.headers, JSON.stringify(req.body, null, 2));
            }

            let result = await promiseHandler(req);

            if (result && !result.response) {
                console.log('BUG: the handler did not include a "response" field');
                throw new Error('control should not get here');
            } else if (!result) {
                console.log('BUG: the handler didnt return a result..');
                throw new Error('control should not get here');
            }

            if (PromiseRouter.verbose) {
                console.log('response:', JSON.stringify(result.response, null, 2));
            }
            let status = result.status || 200;
            res.status(status);
            if (result.location) {
                res.set('Location', result.location);
            }
            res.json(result.response);
        } catch (e) {
            //console.error(`PromiseRouter: ${e.message}`, e.stack);
            next(e);
        }
    };
}

PromiseRouter.verbose = false;

export default PromiseRouter;
