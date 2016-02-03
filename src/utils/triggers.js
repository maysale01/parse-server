import { Parse } from 'parse/node';

const Types = {
    beforeSave: 'beforeSave',
    afterSave: 'afterSave',
    beforeDelete: 'beforeDelete',
    afterDelete: 'afterDelete'
};

export function getTrigger(className, triggerType) {
    if (Parse.Cloud.Triggers
    && Parse.Cloud.Triggers[triggerType]
    && Parse.Cloud.Triggers[triggerType][className]) {
        return Parse.Cloud.Triggers[triggerType][className];
    }
    return undefined;
};

export function getRequestObject(triggerType, auth, parseObject, originalParseObject) {
    let request = {
        triggerName: triggerType,
        object: parseObject,
        master: false
    };
    if (originalParseObject) {
        request.original = originalParseObject;
    }
    if (!auth) {
        return request;
    }
    if (auth.isMaster) {
        request['master'] = true;
    }
    if (auth.user) {
        request['user'] = auth.user;
    }
  // TODO: Add installation to Auth?
    if (auth.installationId) {
        request['installationId'] = auth.installationId;
    }
    return request;
};

// Creates the response object, and uses the request object to pass data
// The API will call this with REST API formatted objects, this will
// transform them to Parse.Object instances expected by Cloud Code.
// Any changes made to the object in a beforeSave will be included.
export function getResponseObject(request, resolve, reject) {
    return {
        success: function() {
            let response = {};
            if (request.triggerName === Types.beforeSave) {
                response['object'] = request.object.toJSON();
            }
            return resolve(response);
        },
        error: function(error) {
            throw new Parse.Error(Parse.Error.SCRIPT_FAILED, error);
        }
    };
};

// To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for befote/afterSave functions
export function maybeRunTrigger(triggerType, auth, parseObject, originalParseObject) {
    if (!parseObject) {
        return Promise.resolve({});
    }
    return new Promise(function (resolve, reject) {
        let trigger = getTrigger(parseObject.className, triggerType);
        if (!trigger) return resolve({});
        let request = getRequestObject(triggerType, auth, parseObject, originalParseObject);
        let response = getResponseObject(request, resolve, reject);
        trigger(request, response);
    });
};

// Converts a REST-format object to a Parse.Object
// data is either className or an object
export function inflate(data, restObject) {
    let copy = typeof data == 'object' ? data : {className: data};
    for (let key in restObject) {
        copy[key] = restObject[key];
    }
    return Parse.Object.fromJSON(copy);
}

export default {
    getTrigger: getTrigger,
    getRequestObject: getRequestObject,
    inflate: inflate,
    maybeRunTrigger: maybeRunTrigger,
    Types: Types
};
