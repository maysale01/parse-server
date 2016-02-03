// functions.js
import { Parse } from 'parse/node';
import { PromiseRouter } from '../classes';
import { rest } from '../utils';

const router = new PromiseRouter();

export function handleCloudFunction(req) {
    // TODO: set user from req.auth
    if (Parse.Cloud.Functions[req.params.functionName]) {
        return new Promise(function (resolve, reject) {
            let response = createResponseObject(resolve, reject);
            let request = {
                params: req.body || {}
            };
            Parse.Cloud.Functions[req.params.functionName](request, response);
        });
    } else {
        throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid function.');
    }
}

export function createResponseObject(resolve, reject) {
    return {
        success: function(result) {
            resolve({
                response: {
                    result: result
                }
            });
        },
        error: function(error) {
            reject(new Parse.Error(Parse.Error.SCRIPT_FAILED, error));
        }
    };
}

router.route('POST', '/functions/:functionName', handleCloudFunction);


export default router;
