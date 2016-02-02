'use strict';

// A database adapter that works with data exported from the hosted
// Parse database.

var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var Parse = require('parse/node').Parse;
var Schema = require('../classes/Schema');
var transform = require('../utils/transform');

// options can contain:
//   collectionPrefix: the string to put in front of every collection name.
function ExportAdapter(mongoURI, options) {
  this.mongoURI = mongoURI;
  options = options || {};

  this.collectionPrefix = options.collectionPrefix;

  // We don't want a mutable this.schema, because then you could have
  // one request that uses different schemas for different parts of
  // it. Instead, use loadSchema to get a schema.
  this.schemaPromise = null;

  this.connect();
}

// Connects to the database. Returns a promise that resolves when the
// connection is successful.
// this.db will be populated with a Mongo "Db" object when the
// promise resolves successfully.
ExportAdapter.prototype.connect = function () {
  var _this = this;

  if (this.connectionPromise) {
    // There's already a connection in progress.
    return this.connectionPromise;
  }

  this.connectionPromise = Promise.resolve().then(function () {
    return MongoClient.connect(_this.mongoURI);
  }).then(function (db) {
    _this.db = db;
  });
  return this.connectionPromise;
};

// Returns a promise for a Mongo collection.
// Generally just for internal use.
var joinRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
var otherRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
ExportAdapter.prototype.collection = function (className) {
  var _this2 = this;

  if (className !== '_User' && className !== '_Installation' && className !== '_Session' && className !== '_SCHEMA' && className !== '_Role' && !joinRegex.test(className) && !otherRegex.test(className)) {
    throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className);
  }
  return this.connect().then(function () {
    return _this2.db.collection(_this2.collectionPrefix + className);
  });
};

function returnsTrue() {
  return true;
}

// Returns a promise for a schema object.
// If we are provided a acceptor, then we run it on the schema.
// If the schema isn't accepted, we reload it at most once.
ExportAdapter.prototype.loadSchema = function (acceptor) {
  var _this3 = this;

  acceptor = acceptor || returnsTrue;

  if (!this.schemaPromise) {
    this.schemaPromise = this.collection('_SCHEMA').then(function (coll) {
      delete _this3.schemaPromise;
      return Schema.load(coll);
    });
    return this.schemaPromise;
  }

  return this.schemaPromise.then(function (schema) {
    if (acceptor(schema)) {
      return schema;
    }
    _this3.schemaPromise = _this3.collection('_SCHEMA').then(function (coll) {
      delete _this3.schemaPromise;
      return Schema.load(coll);
    });
    return _this3.schemaPromise;
  });
};

// Returns a promise for the classname that is related to the given
// classname through the key.
// TODO: make this not in the ExportAdapter interface
ExportAdapter.prototype.redirectClassNameForKey = function (className, key) {
  return this.loadSchema().then(function (schema) {
    var t = schema.getExpectedType(className, key);
    var match = t.match(/^relation<(.*)>$/);
    if (match) {
      return match[1];
    } else {
      return className;
    }
  });
};

// Uses the schema to validate the object (REST API format).
// Returns a promise that resolves to the new schema.
// This does not update this.schema, because in a situation like a
// batch request, that could confuse other users of the schema.
ExportAdapter.prototype.validateObject = function (className, object) {
  return this.loadSchema().then(function (schema) {
    return schema.validateObject(className, object);
  });
};

// Like transform.untransformObject but you need to provide a className.
// Filters out any data that shouldn't be on this REST-formatted object.
ExportAdapter.prototype.untransformObject = function (schema, isMaster, aclGroup, className, mongoObject) {
  var object = transform.untransformObject(schema, className, mongoObject);

  if (className !== '_User') {
    return object;
  }

  if (isMaster || aclGroup.indexOf(object.objectId) > -1) {
    return object;
  }

  delete object.authData;
  delete object.sessionToken;
  return object;
};

// Runs an update on the database.
// Returns a promise for an object with the new values for field
// modifications that don't know their results ahead of time, like
// 'increment'.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
ExportAdapter.prototype.update = function (className, query, update, options) {
  var _this4 = this;

  var acceptor = function acceptor(schema) {
    return schema.hasKeys(className, Object.keys(query));
  };
  var isMaster = !('acl' in options);
  var aclGroup = options.acl || [];
  var mongoUpdate, schema;
  return this.loadSchema(acceptor).then(function (s) {
    schema = s;
    if (!isMaster) {
      return schema.validatePermission(className, aclGroup, 'update');
    }
    return Promise.resolve();
  }).then(function () {

    return _this4.handleRelationUpdates(className, query.objectId, update);
  }).then(function () {
    return _this4.collection(className);
  }).then(function (coll) {
    var mongoWhere = transform.transformWhere(schema, className, query);
    if (options.acl) {
      var writePerms = [{ _wperm: { '$exists': false } }];
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = options.acl[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var entry = _step.value;

          writePerms.push({ _wperm: { '$in': [entry] } });
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

      mongoWhere = { '$and': [mongoWhere, { '$or': writePerms }] };
    }

    mongoUpdate = transform.transformUpdate(schema, className, update);

    return coll.findAndModify(mongoWhere, {}, mongoUpdate, {});
  }).then(function (result) {
    if (!result.value) {
      return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.'));
    }
    if (result.lastErrorObject.n != 1) {
      return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.'));
    }

    var response = {};
    var inc = mongoUpdate['$inc'];
    if (inc) {
      for (var key in inc) {
        response[key] = (result.value[key] || 0) + inc[key];
      }
    }
    return response;
  });
};

// Processes relation-updating operations from a REST-format update.
// Returns a promise that resolves successfully when these are
// processed.
// This mutates update.
ExportAdapter.prototype.handleRelationUpdates = function (className, objectId, update) {
  var _this5 = this;

  var pending = [];
  var deleteMe = [];
  objectId = update.objectId || objectId;

  var process = function process(op, key) {
    if (!op) {
      return;
    }
    if (op.__op == 'AddRelation') {
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = op.objects[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var object = _step2.value;

          pending.push(_this5.addRelation(key, className, objectId, object.objectId));
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

      deleteMe.push(key);
    }

    if (op.__op == 'RemoveRelation') {
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = op.objects[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var object = _step3.value;

          pending.push(_this5.removeRelation(key, className, objectId, object.objectId));
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

      deleteMe.push(key);
    }

    if (op.__op == 'Batch') {
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = op.ops[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          x = _step4.value;

          process(x, key);
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }
    }
  };

  for (var key in update) {
    process(update[key], key);
  }
  var _iteratorNormalCompletion5 = true;
  var _didIteratorError5 = false;
  var _iteratorError5 = undefined;

  try {
    for (var _iterator5 = deleteMe[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
      var key = _step5.value;

      delete update[key];
    }
  } catch (err) {
    _didIteratorError5 = true;
    _iteratorError5 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion5 && _iterator5.return) {
        _iterator5.return();
      }
    } finally {
      if (_didIteratorError5) {
        throw _iteratorError5;
      }
    }
  }

  return Promise.all(pending);
};

// Adds a relation.
// Returns a promise that resolves successfully iff the add was successful.
ExportAdapter.prototype.addRelation = function (key, fromClassName, fromId, toId) {
  var doc = {
    relatedId: toId,
    owningId: fromId
  };
  var className = '_Join:' + key + ':' + fromClassName;
  return this.collection(className).then(function (coll) {
    return coll.update(doc, doc, { upsert: true });
  });
};

// Removes a relation.
// Returns a promise that resolves successfully iff the remove was
// successful.
ExportAdapter.prototype.removeRelation = function (key, fromClassName, fromId, toId) {
  var doc = {
    relatedId: toId,
    owningId: fromId
  };
  var className = '_Join:' + key + ':' + fromClassName;
  return this.collection(className).then(function (coll) {
    return coll.remove(doc);
  });
};

// Removes objects matches this query from the database.
// Returns a promise that resolves successfully iff the object was
// deleted.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
ExportAdapter.prototype.destroy = function (className, query, options) {
  var _this6 = this;

  options = options || {};
  var isMaster = !('acl' in options);
  var aclGroup = options.acl || [];

  var schema;
  return this.loadSchema().then(function (s) {
    schema = s;
    if (!isMaster) {
      return schema.validatePermission(className, aclGroup, 'delete');
    }
    return Promise.resolve();
  }).then(function () {

    return _this6.collection(className);
  }).then(function (coll) {
    var mongoWhere = transform.transformWhere(schema, className, query);

    if (options.acl) {
      var writePerms = [{ _wperm: { '$exists': false } }];
      var _iteratorNormalCompletion6 = true;
      var _didIteratorError6 = false;
      var _iteratorError6 = undefined;

      try {
        for (var _iterator6 = options.acl[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
          var entry = _step6.value;

          writePerms.push({ _wperm: { '$in': [entry] } });
        }
      } catch (err) {
        _didIteratorError6 = true;
        _iteratorError6 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion6 && _iterator6.return) {
            _iterator6.return();
          }
        } finally {
          if (_didIteratorError6) {
            throw _iteratorError6;
          }
        }
      }

      mongoWhere = { '$and': [mongoWhere, { '$or': writePerms }] };
    }

    return coll.remove(mongoWhere);
  }).then(function (resp) {
    if (resp.result.n === 0) {
      return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.'));
    }
  }, function (error) {
    throw error;
  });
};

// Inserts an object into the database.
// Returns a promise that resolves successfully iff the object saved.
ExportAdapter.prototype.create = function (className, object, options) {
  var _this7 = this;

  var schema;
  var isMaster = !('acl' in options);
  var aclGroup = options.acl || [];

  return this.loadSchema().then(function (s) {
    schema = s;
    if (!isMaster) {
      return schema.validatePermission(className, aclGroup, 'create');
    }
    return Promise.resolve();
  }).then(function () {

    return _this7.handleRelationUpdates(className, null, object);
  }).then(function () {
    return _this7.collection(className);
  }).then(function (coll) {
    var mongoObject = transform.transformCreate(schema, className, object);
    return coll.insert([mongoObject]);
  });
};

// Runs a mongo query on the database.
// This should only be used for testing - use 'find' for normal code
// to avoid Mongo-format dependencies.
// Returns a promise that resolves to a list of items.
ExportAdapter.prototype.mongoFind = function (className, query, options) {
  options = options || {};
  return this.collection(className).then(function (coll) {
    return coll.find(query, options).toArray();
  });
};

// Deletes everything in the database matching the current collectionPrefix
// Won't delete collections in the system namespace
// Returns a promise.
ExportAdapter.prototype.deleteEverything = function () {
  var _this8 = this;

  this.schemaPromise = null;

  return this.connect().then(function () {
    return _this8.db.collections();
  }).then(function (colls) {
    var promises = [];
    var _iteratorNormalCompletion7 = true;
    var _didIteratorError7 = false;
    var _iteratorError7 = undefined;

    try {
      for (var _iterator7 = colls[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
        var coll = _step7.value;

        if (!coll.namespace.match(/\.system\./) && coll.collectionName.indexOf(_this8.collectionPrefix) === 0) {
          promises.push(coll.drop());
        }
      }
    } catch (err) {
      _didIteratorError7 = true;
      _iteratorError7 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion7 && _iterator7.return) {
          _iterator7.return();
        }
      } finally {
        if (_didIteratorError7) {
          throw _iteratorError7;
        }
      }
    }

    return Promise.all(promises);
  });
};

// Finds the keys in a query. Returns a Set. REST format only
function keysForQuery(query) {
  var sublist = query['$and'] || query['$or'];
  if (sublist) {
    var answer = new Set();
    var _iteratorNormalCompletion8 = true;
    var _didIteratorError8 = false;
    var _iteratorError8 = undefined;

    try {
      for (var _iterator8 = sublist[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
        var subquery = _step8.value;
        var _iteratorNormalCompletion9 = true;
        var _didIteratorError9 = false;
        var _iteratorError9 = undefined;

        try {
          for (var _iterator9 = keysForQuery(subquery)[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
            var key = _step9.value;

            answer.add(key);
          }
        } catch (err) {
          _didIteratorError9 = true;
          _iteratorError9 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion9 && _iterator9.return) {
              _iterator9.return();
            }
          } finally {
            if (_didIteratorError9) {
              throw _iteratorError9;
            }
          }
        }
      }
    } catch (err) {
      _didIteratorError8 = true;
      _iteratorError8 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion8 && _iterator8.return) {
          _iterator8.return();
        }
      } finally {
        if (_didIteratorError8) {
          throw _iteratorError8;
        }
      }
    }

    return answer;
  }

  return new Set(Object.keys(query));
}

// Returns a promise for a list of related ids given an owning id.
// className here is the owning className.
ExportAdapter.prototype.relatedIds = function (className, key, owningId) {
  var joinTable = '_Join:' + key + ':' + className;
  return this.collection(joinTable).then(function (coll) {
    return coll.find({ owningId: owningId }).toArray();
  }).then(function (results) {
    return results.map(function (r) {
      return r.relatedId;
    });
  });
};

// Returns a promise for a list of owning ids given some related ids.
// className here is the owning className.
ExportAdapter.prototype.owningIds = function (className, key, relatedIds) {
  var joinTable = '_Join:' + key + ':' + className;
  return this.collection(joinTable).then(function (coll) {
    return coll.find({ relatedId: { '$in': relatedIds } }).toArray();
  }).then(function (results) {
    return results.map(function (r) {
      return r.owningId;
    });
  });
};

// Modifies query so that it no longer has $in on relation fields, or
// equal-to-pointer constraints on relation fields.
// Returns a promise that resolves when query is mutated
// TODO: this only handles one of these at a time - make it handle more
ExportAdapter.prototype.reduceInRelation = function (className, query, schema) {
  // Search for an in-relation or equal-to-relation
  for (var key in query) {
    if (query[key] && (query[key]['$in'] || query[key].__type == 'Pointer')) {
      var t = schema.getExpectedType(className, key);
      var match = t ? t.match(/^relation<(.*)>$/) : false;
      if (!match) {
        continue;
      }
      var relatedClassName = match[1];
      var relatedIds;
      if (query[key]['$in']) {
        relatedIds = query[key]['$in'].map(function (r) {
          return r.objectId;
        });
      } else {
        relatedIds = [query[key].objectId];
      }
      return this.owningIds(className, key, relatedIds).then(function (ids) {
        delete query[key];
        query.objectId = { '$in': ids };
      });
    }
  }
  return Promise.resolve();
};

// Modifies query so that it no longer has $relatedTo
// Returns a promise that resolves when query is mutated
ExportAdapter.prototype.reduceRelationKeys = function (className, query) {
  var _this9 = this;

  var relatedTo = query['$relatedTo'];
  if (relatedTo) {
    return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId).then(function (ids) {
      delete query['$relatedTo'];
      query['objectId'] = { '$in': ids };
      return _this9.reduceRelationKeys(className, query);
    });
  }
};

// Does a find with "smart indexing".
// Currently this just means, if it needs a geoindex and there is
// none, then build the geoindex.
// This could be improved a lot but it's not clear if that's a good
// idea. Or even if this behavior is a good idea.
ExportAdapter.prototype.smartFind = function (coll, where, options) {
  return coll.find(where, options).toArray().then(function (result) {
    return result;
  }, function (error) {
    // Check for "no geoindex" error
    if (!error.message.match(/unable to find index for .geoNear/) || error.code != 17007) {
      throw error;
    }

    // Figure out what key needs an index
    var key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];
    if (!key) {
      throw error;
    }

    var index = {};
    index[key] = '2d';
    return coll.createIndex(index).then(function () {
      // Retry, but just once.
      return coll.find(where, options).toArray();
    });
  });
};

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
ExportAdapter.prototype.find = function (className, query, options) {
  var _this10 = this;

  options = options || {};
  var mongoOptions = {};
  if (options.skip) {
    mongoOptions.skip = options.skip;
  }
  if (options.limit) {
    mongoOptions.limit = options.limit;
  }

  var isMaster = !('acl' in options);
  var aclGroup = options.acl || [];
  var acceptor = function acceptor(schema) {
    return schema.hasKeys(className, keysForQuery(query));
  };
  var schema;
  return this.loadSchema(acceptor).then(function (s) {
    schema = s;
    if (options.sort) {
      mongoOptions.sort = {};
      for (var key in options.sort) {
        var mongoKey = transform.transformKey(schema, className, key);
        mongoOptions.sort[mongoKey] = options.sort[key];
      }
    }

    if (!isMaster) {
      var op = 'find';
      var k = Object.keys(query);
      if (k.length == 1 && typeof query.objectId == 'string') {
        op = 'get';
      }
      return schema.validatePermission(className, aclGroup, op);
    }
    return Promise.resolve();
  }).then(function () {
    return _this10.reduceRelationKeys(className, query);
  }).then(function () {
    return _this10.reduceInRelation(className, query, schema);
  }).then(function () {
    return _this10.collection(className);
  }).then(function (coll) {
    var mongoWhere = transform.transformWhere(schema, className, query);
    if (!isMaster) {
      var orParts = [{ "_rperm": { "$exists": false } }, { "_rperm": { "$in": ["*"] } }];
      var _iteratorNormalCompletion10 = true;
      var _didIteratorError10 = false;
      var _iteratorError10 = undefined;

      try {
        for (var _iterator10 = aclGroup[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
          var acl = _step10.value;

          orParts.push({ "_rperm": { "$in": [acl] } });
        }
      } catch (err) {
        _didIteratorError10 = true;
        _iteratorError10 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion10 && _iterator10.return) {
            _iterator10.return();
          }
        } finally {
          if (_didIteratorError10) {
            throw _iteratorError10;
          }
        }
      }

      mongoWhere = { '$and': [mongoWhere, { '$or': orParts }] };
    }
    if (options.count) {
      return coll.count(mongoWhere, mongoOptions);
    } else {
      return _this10.smartFind(coll, mongoWhere, mongoOptions).then(function (mongoResults) {
        return mongoResults.map(function (r) {
          return _this10.untransformObject(schema, isMaster, aclGroup, className, r);
        });
      });
    }
  });
};

module.exports = ExportAdapter;