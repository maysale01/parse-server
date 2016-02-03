// This file contains helpers for running operations in REST format.
// The goal is that handlers that explicitly handle an express route
// should just be shallow wrappers around things in this file, but
// these functions should not explicitly depend on the request
// object.
// This means that one of these handlers can support multiple
// routes. That's useful for the routes that do really similar
// things.

import { Parse } from 'parse/node';
import { default as triggers } from './triggers';
import { RestQuery, RestWrite } from '../classes';

export default class RestClient {
    // Returns a promise for an object with optional keys 'results' and 'count'.
    static find(config, auth, className, restWhere, restOptions) {
        RestClient.enforceRoleSecurity('find', className, auth);
        let query = new RestQuery(config, auth, className, restWhere, restOptions);
        return query.execute();
    }

    // Returns a promise that doesn't resolve to any useful value.
    static del(config, auth, className, objectId, cache) {
        if (typeof objectId !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad objectId');
        }

        if (className === '_User' && !auth.couldUpdateUserId(objectId)) {
            throw new Parse.Error(Parse.Error.SESSION_MISSING, 'insufficient auth to delete user');
        }

        RestClient.enforceRoleSecurity('delete', className, auth);

        let inflatedObject;

        return Promise.resolve()
        .then(() => {
            // Make sure that you do not catch any exceptions throw in this promise chain.. 
            // they need to propagate so that the lifecycle hooks will effectively cancel a transaction.
            if (triggers.getTrigger(className, 'beforeDelete') ||
            triggers.getTrigger(className, 'afterDelete') ||
            className == '_Session') {
                return RestClient.find(config, auth, className, {objectId: objectId})
                .then((response) => {
                      if (response && response.results && response.results.length) {
                          response.results[0].className = className;
                          cache.clearUser(response.results[0].sessionToken);
                          inflatedObject = Parse.Object.fromJSON(response.results[0]);
                          return triggers.maybeRunTrigger('beforeDelete', auth, inflatedObject);
                      }
                      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `[RestClient: ${className}]: Object not found for delete.`);
                })
            }
            return Promise.resolve({});
        }).then(() => {
            let options = {};
            if (!auth.isMaster) {
                options.acl = ['*'];
                if (auth.user) {
                    options.acl.push(auth.user.id);
                }
            }

            return config.database.destroy(className, {
                objectId: objectId
            }, options);
        }).then(() => {
            triggers.maybeRunTrigger('afterDelete', auth, inflatedObject);
            return Promise.resolve();
        });
    }

    // Returns a promise for a {response, status, location} object.
    static create(config, auth, className, restObject) {
        RestClient.enforceRoleSecurity('create', className, auth);
        let write = new RestWrite(config, auth, className, null, restObject);
        return write.execute();
    }

    // Returns a promise that contains the fields of the update that the
    // REST API is supposed to return.
    // Usually, this is just updatedAt.
    static update(config, auth, className, objectId, restObject) {
        RestClient.enforceRoleSecurity('update', className, auth);

        return Promise.resolve().then(() => {
            if (triggers.getTrigger(className, 'beforeSave') ||
            triggers.getTrigger(className, 'afterSave')) {
                return RestClient.find(config, auth, className, {objectId: objectId});
            }
            return Promise.resolve({});
        }).then((response) => {
            let originalRestObject;
            if (response && response.results && response.results.length) {
                originalRestObject = response.results[0];
            }

            let write = new RestWrite(config, auth, className,
                                  {objectId: objectId}, restObject, originalRestObject);
            return write.execute();
        });
    }

    // Disallowing access to the _Role collection except by master key
    static enforceRoleSecurity(method, className, auth) {
        if (className === '_Role' && !auth.isMaster) {
            throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Clients aren\'t allowed to perform the ${method} operation on the role collection.`);
        }
        if (method === 'delete' && className === '_Installation' && !auth.isMaster) {
            throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Clients aren\'t allowed to perform the delete operation on the installation collection.');
        }
    }
}

export default RestClient;