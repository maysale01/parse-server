// A database adapter that works with data exported from the hosted
// Parse database.

import { MongoClient } from 'mongodb';
import { Parse } from 'parse/node';
import { transform } from '../utils';
import { default as DatabaseAdapterInterface } from '../interfaces/DatabaseAdapter';
import { Schema } from '../classes';

// Generally just for internal use.
const joinRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const otherRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
const INVALID_CLASS_NAME_ERROR = Parse.Error.INVALID_CLASS_NAME;
const OBJECT_NOT_FOUND_ERROR = Parse.Error.OBJECT_NOT_FOUND;

function returnsTrue() {
    return true;
}

// Finds the keys in a query. Returns a Set. REST format only
function keysForQuery(query) {
    let sublist = query['$and'] || query['$or'];
    if (sublist) {
        let answer = new Set();
        for (let subquery of sublist) {
            for (let key of keysForQuery(subquery)) {
                answer.add(key);
            }
        }
        return answer;
    }

    return new Set(Object.keys(query));
}

class ExportAdapter extends DatabaseAdapterInterface {
    constructor(mongoURI, options = {}) {
        super();

        this._mongoURI = mongoURI;
        this._collectionPrefix = options.collectionPrefix;
        this._db = null;
        this._connectionPromise = null;

        // We don't want a mutable this.schema, because then you could have
        // one request that uses different schemas for different parts of
        // it. Instead, use loadSchema to get a schema.
        this._schemaPromise = null;
        this.connect();
    }

    get mongoURI () {
        return this._mongoURI;
    }

    get collectionPrefix () {
        return this._collectionPrefix;
    }

    get db () {
        return this._db;
    }

    set mongoURI (value) {
        this._mongoURI = value;
    }

    set collectionPrefix (value) {
        this._collectionPrefix = value;
    }

    set db (value) {
        this._db = value;
    }

    // Connects to the database. Returns a promise that resolves when the
    // connection is successful.
    // this.db will be populated with a Mongo "Db" object when the
    // promise resolves successfully.
    connect() {
        if (this._connectionPromise) {
            // There's already a connection in progress.
            return this._connectionPromise;
        }

        this._connectionPromise = Promise.resolve().then(() => {
            return MongoClient.connect(this._mongoURI);
        }).then((db) => {
            this._db = db;
        });
        return this._connectionPromise;
    }

    // Returns a promise for a Mongo collection.
    collection(className) {
        if (className !== '_User' &&
          className !== '_Installation' &&
          className !== '_Session' &&
          className !== '_SCHEMA' &&
          className !== '_Role' &&
          !joinRegex.test(className) &&
          !otherRegex.test(className)) {
            throw new Parse.Error(INVALID_CLASS_NAME_ERROR, `invalid className: ${className}`);
        }
        return this.connect().then(() => {
            return this._db.collection(this._collectionPrefix + className);
        });
    }


    // Returns a promise for a schema object.
    // If we are provided a acceptor, then we run it on the schema.
    // If the schema isn't accepted, we reload it at most once.
    loadSchema(acceptor) {
        acceptor = acceptor || returnsTrue;

        if (!this._schemaPromise) {
            this._schemaPromise = this.collection('_SCHEMA')
            .then((coll) => {
                delete this._schemaPromise;
                return Schema.load(coll);
            });
            return this._schemaPromise;
        }

        return this._schemaPromise
        .then((schema) => {
            if (acceptor(schema)) {
                return schema;
            }
            this._schemaPromise = this.collection('_SCHEMA')
            .then((coll) => {
                delete this._schemaPromise;
                return Schema.load(coll);
            });
            return this._schemaPromise;
        });
    }


    // Returns a promise for the classname that is related to the given
    // classname through the key.
    // TODO: make this not in the ExportAdapter interface
    redirectClassNameForKey(className, key) {
        return this.loadSchema()
        .then((schema) => {
            let t = schema.getExpectedType(className, key);
            let match = t.match(/^relation<(.*)>$/);
            if (match) {
                return match[1];
            } else {
                return className;
            }
        });
    }


    // Uses the schema to validate the object (REST API format).
    // Returns a promise that resolves to the new schema.
    // This does not update this.schema, because in a situation like a
    // batch request, that could confuse other users of the schema.
    validateObject(className, object) {
        return this.loadSchema()
        .then((schema) => {
            return schema.validateObject(className, object);
        });
    }

    // Like transform.untransformObject but you need to provide a className.
    // Filters out any data that shouldn't be on this REST-formatted object.
    untransformObject(schema, isMaster, aclGroup, className, mongoObject) {
        const object = transform.untransformObject(schema, className, mongoObject);

        if (className !== '_User') {
            return object;
        }

        if (isMaster || (aclGroup.indexOf(object.objectId) > -1)) {
            return object;
        }

        delete object.authData;
        delete object.sessionToken;
        return object;
    }

    // Runs an update on the database.
    // Returns a promise for an object with the new values for field
    // modifications that don't know their results ahead of time, like
    // 'increment'.
    // Options:
    //   acl:  a list of strings. If the object to be updated has an ACL,
    //         one of the provided strings must provide the caller with
    //         write permissions.
    update(className, query, update, options) {
        let acceptor = function(schema) {
            return schema.hasKeys(className, Object.keys(query));
        };
        let isMaster = !('acl' in options);
        let aclGroup = options.acl || [];
        let mongoUpdate, schema;
        return this.loadSchema(acceptor).then((s) => {
            schema = s;
            if (!isMaster) {
                return schema.validatePermission(className, aclGroup, 'update');
            }
            return Promise.resolve();
        }).then(() => {
            return this.handleRelationUpdates(className, query.objectId, update);
        }).then(() => {
            return this.collection(className);
        }).then((coll) => {
            let mongoWhere = transform.transformWhere(schema, className, query);
            if (options.acl) {
                let writePerms = [
            {_wperm: {'$exists': false}}
                ];
                for (let entry of options.acl) {
                    writePerms.push({_wperm: {'$in': [entry]}});
                }
                mongoWhere = {'$and': [mongoWhere, {'$or': writePerms}]};
            }

            mongoUpdate = transform.transformUpdate(schema, className, update);

            return coll.findAndModify(mongoWhere, {}, mongoUpdate, {});
        }).then((result) => {
            if (!result.value) {
                return Promise.reject(new Parse.Error(OBJECT_NOT_FOUND_ERROR, 'Object not found.'));
            }
            if (result.lastErrorObject.n != 1) {
                return Promise.reject(new Parse.Error(OBJECT_NOT_FOUND_ERROR, 'Object not found.'));
            }

            let response = {};
            let inc = mongoUpdate['$inc'];
            if (inc) {
                for (let key in inc) {
                    response[key] = (result.value[key] || 0) + inc[key];
                }
            }
            return response;
        });
    }

    // Processes relation-updating operations from a REST-format update.
    // Returns a promise that resolves successfully when these are
    // processed.
    // This mutates update.
    handleRelationUpdates(className, objectId, update) {
        let pending = [];
        let deleteMe = [];
        objectId = update.objectId || objectId;

        let processFn = (op, key) => {
            if (!op) {
                return;
            }
            if (op.__op == 'AddRelation') {
                for (let object of op.objects) {
                    pending.push(
                        this.addRelation(key, className, objectId, object.objectId)
                    );
                }
                deleteMe.push(key);
            }

            if (op.__op == 'RemoveRelation') {
                for (let object of op.objects) {
                    pending.push(
                        this.removeRelation(key, className, objectId, object.objectId)
                    );
                }
                deleteMe.push(key);
            }

            if (op.__op == 'Batch') {
                for (let x of op.ops) {
                    processFn(x, key);
                }
            }
        };

        for (let key in update) {
            processFn(update[key], key);
        }
        for (let key of deleteMe) {
            delete update[key];
        }
        return Promise.all(pending);
    }

    // Adds a relation.
    // Returns a promise that resolves successfully iff the add was successful.
    addRelation(key, fromClassName, fromId, toId) {
        let doc = {
            relatedId: toId,
            owningId: fromId
        };

        return this.collection(className)
        .then((coll) => {
            return coll.update(doc, doc, {upsert: true});
        });
    }


    // Removes a relation.
    // Returns a promise that resolves successfully iff the remove was
    // successful.
    removeRelation(key, fromClassName, fromId, toId) {
        let doc = {
            relatedId: toId,
            owningId: fromId
        };

        let className = `_Join: ${key}:${fromClassName}`;
        return this.collection(className)
        .then((coll) => {
            return coll.remove(doc);
        });
    }

    // Removes objects matches this query from the database.
    // Returns a promise that resolves successfully iff the object was
    // deleted.
    // Options:
    //   acl:  a list of strings. If the object to be updated has an ACL,
    //         one of the provided strings must provide the caller with
    //         write permissions.
    destroy(className, query, options) {
        options = options || {};
        let isMaster = !('acl' in options);
        let aclGroup = options.acl || [];

        let schema;
        return this.loadSchema().then((s) => {
            schema = s;
            if (!isMaster) {
                return schema.validatePermission(className, aclGroup, 'delete');
            }
            return Promise.resolve();
        }).then(() => {

            return this.collection(className);
        }).then((coll) => {
            let mongoWhere = transform.transformWhere(schema, className, query);

            if (options.acl) {
                let writePerms = [
            {_wperm: {'$exists': false}}
                ];
                for (let entry of options.acl) {
                    writePerms.push({_wperm: {'$in': [entry]}});
                }
                mongoWhere = {'$and': [mongoWhere, {'$or': writePerms}]};
            }

            return coll.remove(mongoWhere);
        }).then((resp) => {
            if (resp.result.n === 0) {
                return Promise.reject(
                    new Parse.Error(OBJECT_NOT_FOUND_ERROR, 'Object not found.')
                );
            }
        })
        .catch((error) => {
            throw error;
        });
    }

    // Inserts an object into the database.
    // Returns a promise that resolves successfully iff the object saved.
    create(className, object, options) {
        let schema;
        let isMaster = !('acl' in options);
        let aclGroup = options.acl || [];

        return this.loadSchema().then((s) => {
            schema = s;
            if (!isMaster) {
                return schema.validatePermission(className, aclGroup, 'create');
            }
            return Promise.resolve();
        }).then(() => {

            return this.handleRelationUpdates(className, null, object);
        }).then(() => {
            return this.collection(className);
        }).then((coll) => {
            let mongoObject = transform.transformCreate(schema, className, object);
            return coll.insert([mongoObject]);
        });
    }


    // Runs a mongo query on the database.
    // This should only be used for testing - use 'find' for normal code
    // to avoid Mongo-format dependencies.
    // Returns a promise that resolves to a list of items.
    mongoFind(className, query, options = {}) {
        return this.collection(className)
        .then((coll) => {
            return coll.find(query, options).toArray();
        });
    }


    // Deletes everything in the database matching the current collectionPrefix
    // Won't delete collections in the system namespace
    // Returns a promise.
    deleteEverything() {
        this._schemaPromise = null;

        return this.connect().then(() => {
            return this._db.collections();
        }).then((colls) => {
            let promises = [];
            for (let coll of colls) {
                if (!coll.namespace.match(/\.system\./) &&
                coll.collectionName.indexOf(this._collectionPrefix) === 0) {
                    promises.push(coll.drop());
                }
            }
            return Promise.all(promises);
        });
    }


    // Returns a promise for a list of related ids given an owning id.
    // className here is the owning className.
    relatedIds(className, key, owningId) {
        let joinTable = `_Join: ${key}:${className}`;
        return this.collection(joinTable)
        .then((coll) => {
            return coll.find({owningId: owningId}).toArray();
        }).then((results) => {
            return results.map(r => r.relatedId);
        });
    } 

    // Returns a promise for a list of owning ids given some related ids.
    // className here is the owning className.
    owningIds(className, key, relatedIds) {
        let joinTable = `_Join: ${key}:${className}`;
        return this.collection(joinTable)
        .then((coll) => {
            return coll.find({relatedId: {'$in': relatedIds}}).toArray();
        }).then((results) => {
            return results.map(r => r.owningId);
        });
    }

    // Modifies query so that it no longer has $in on relation fields, or
    // equal-to-pointer constraints on relation fields.
    // Returns a promise that resolves when query is mutated
    // TODO: this only handles one of these at a time - make it handle more
    reduceInRelation(className, query, schema) {
        // Search for an in-relation or equal-to-relation
        for (let key in query) {
            if (query[key] &&
            (query[key]['$in'] || query[key].__type == 'Pointer')) {
                let t = schema.getExpectedType(className, key);
                let match = t ? t.match(/^relation<(.*)>$/) : false;
                if (!match) {
                    continue;
                }
                let relatedClassName = match[1];
                let relatedIds;
                if (query[key]['$in']) {
                    relatedIds = query[key]['$in'].map(r => r.objectId);
                } else {
                    relatedIds = [query[key].objectId];
                }
                return this.owningIds(className, key, relatedIds)
                .then((ids) => {
                    delete query[key];
                    query.objectId = {'$in': ids};
                });
            }
        }
        return Promise.resolve();
    }

    // Modifies query so that it no longer has $relatedTo
    // Returns a promise that resolves when query is mutated
    reduceRelationKeys(className, query) {
        let relatedTo = query['$relatedTo'];
        if (relatedTo) {
            return this.relatedIds(
                relatedTo.object.className,
                relatedTo.key,
                relatedTo.object.objectId
            ).then((ids) => {
                delete query['$relatedTo'];
                query['objectId'] = {'$in': ids};
                return this.reduceRelationKeys(className, query);
            });
        }
    }

    // Does a find with "smart indexing".
    // Currently this just means, if it needs a geoindex and there is
    // none, then build the geoindex.
    // This could be improved a lot but it's not clear if that's a good
    // idea. Or even if this behavior is a good idea.
    smartFind(coll, where, options) {
        return coll.find(where, options).toArray()
        .then((result) => {
            return result;
        }).catch((error) => {
            // Check for "no geoindex" error
            if (!error.message.match(/unable to find index for .geoNear/) || error.code != 17007) {
                throw error;
            }

            // Figure out what key needs an index
            let key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];
            if (!key) {
                throw error;
            }

            let index = {};
            index[key] = '2d';
            return coll.createIndex(index)
            .then(() => {
                // Retry, but just once.
                return coll.find(where, options).toArray();
            });
        });
    }

    // Runs a query on the database.
    // Returns a promise that resolves to a list of items.
    // Options:
    //   skip    number of results to skip.
    //   limit   limit to this number of results.
    //   sort    an object where keys are the fields to sort by.
    //           the value is +1 for ascending, -1 for descending.
    //   count   run a count instead of returning results.
    //   acl     restrict this operation with an ACL for the provided array
    //           of user objectIds and roles. acl: null means no user.
    //           when this field is not present, don't do anything regarding ACLs.
    // TODO: make userIds not needed here. The db adapter shouldn't know
    // anything about users, ideally. Then, improve the format of the ACL
    // arg to work like the others.
    find(className, query, options = {}) {
        let mongoOptions = {};
        if (options.skip) {
            mongoOptions.skip = options.skip;
        }
        if (options.limit) {
            mongoOptions.limit = options.limit;
        }

        let isMaster = !('acl' in options);
        let aclGroup = options.acl || [];
        let acceptor = function(schema) {
            return schema.hasKeys(className, keysForQuery(query));
        };
        let schema;
        return this.loadSchema(acceptor).then((s) => {
            schema = s;
            if (options.sort) {
                mongoOptions.sort = {};
                for (let key in options.sort) {
                    let mongoKey = transform.transformKey(schema, className, key);
                    mongoOptions.sort[mongoKey] = options.sort[key];
                }
            }

            if (!isMaster) {
                let op = 'find';
                let k = Object.keys(query);
                if (k.length == 1 && typeof query.objectId == 'string') {
                    op = 'get';
                }
                return schema.validatePermission(className, aclGroup, op);
            }
            return Promise.resolve();
        }).then(() => {
            return this.reduceRelationKeys(className, query);
        }).then(() => {
            return this.reduceInRelation(className, query, schema);
        }).then(() => {
            return this.collection(className);
        }).then((coll) => {
            let mongoWhere = transform.transformWhere(schema, className, query);
            if (!isMaster) {
                let orParts = [
                    {'_rperm' : { '$exists': false }},
                    {'_rperm' : { '$in' : ['*']}}
                ];
                for (let acl of aclGroup) {
                    orParts.push({'_rperm' : { '$in' : [acl]}});
                }
                mongoWhere = {'$and': [mongoWhere, {'$or': orParts}]};
            }
            if (options.count) {
                return coll.count(mongoWhere, mongoOptions);
            } else {
                return this.smartFind(coll, mongoWhere, mongoOptions)
                .then((mongoResults) => {
                    return mongoResults.map((r) => {
                        return this.untransformObject(
                      schema, isMaster, aclGroup, className, r);
                    });
                });
            }
        });
    }
}

export default ExportAdapter;
