import { Parse } from 'parse/node';

const INVALID_JSON_ERROR = Parse.Error.INVALID_JSON;
const batchPath = "/batch";

// Returns a promise for a {response} object.
// TODO: pass along auth correctly
function handleBatch(req) {
    if (!req.body.requests instanceof Array) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'requests must be an array');
    }

  // The batch paths are all from the root of our domain.
  // That means they include the API prefix, that the API is mounted
  // to. However, our promise router does not route the api prefix. So
  // we need to figure out the API prefix, so that we can strip it
  // from all the subrequests.
    if (!req.originalUrl.endsWith(batchPath)) {
        throw new Error('internal routing problem - expected url to end with batch');
    }

    const apiPrefixLength = req.originalUrl.length - batchPath.length;
    const apiPrefix = req.originalUrl.slice(0, apiPrefixLength);
    const router = this;
    const promises = [];

    // Iterate over the requests
    for (let restRequest of req.body.requests) {

        // Parse the routable path from the path (slice off the api prefix)
        if (restRequest.path.slice(0, apiPrefixLength) != apiPrefix) {
            throw new Parse.Error(INVALID_JSON_ERROR, `cannot route batch path ${restRequest.path}`);
        }

        let routablePath = restRequest.path.slice(apiPrefixLength);

        // Use the router to figure out what handler to use
        let match = router.match(restRequest.method, routablePath);
        if (!match) {
            throw new Parse.Error(INVALID_JSON_ERROR, `cannot route ${restRequest.method} ${routablePath}`);
        }

        // Construct a request that we can send to a handler
        let request = Object.assign({}, 
            {
                body: restRequest.body,
                params: match.params,
                config: req.config,
                auth: req.auth
            }
        );

        let handlerPromise = match.handler(request)
        .then((response) => {
            return {success: response.response};
        })
        .catch((error) => {
            return {error: {code: error.code, error: error.message}};
        });

        promises.push(handlerPromise);
    }

    return Promise.all(promises)
    .then((results) => {
        return {response: results};
    });
}

export default handleBatch;