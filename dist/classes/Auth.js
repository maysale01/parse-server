'use strict';

var deepcopy = require('deepcopy');
var Parse = require('parse/node').Parse;
var RestQuery = require('./RestQuery');

var cache = require('../utils/cache');

// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth(config, isMaster, userObject) {
  this.config = config;
  this.isMaster = isMaster;
  this.user = userObject;

  // Assuming a users roles won't change during a single request, we'll
  // only load them once.
  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
}

// Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.
Auth.prototype.couldUpdateUserId = function (userId) {
  if (this.isMaster) {
    return true;
  }
  if (this.user && this.user.id === userId) {
    return true;
  }
  return false;
};

// A helper to get a master-level Auth object
function master(config) {
  return new Auth(config, true, null);
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth(config, false, null);
}

// Returns a promise that resolves to an Auth object
var getAuthForSessionToken = function getAuthForSessionToken(config, sessionToken) {
  var cachedUser = cache.getUser(sessionToken);
  if (cachedUser) {
    return Promise.resolve(new Auth(config, false, cachedUser));
  }
  var restOptions = {
    limit: 1,
    include: 'user'
  };
  var restWhere = {
    _session_token: sessionToken
  };
  var query = new RestQuery(config, master(config), '_Session', restWhere, restOptions);
  return query.execute().then(function (response) {
    var results = response.results;
    if (results.length !== 1 || !results[0]['user']) {
      return nobody(config);
    }
    var obj = results[0]['user'];
    delete obj.password;
    obj['className'] = '_User';
    var userObject = Parse.Object.fromJSON(obj);
    cache.setUser(sessionToken, userObject);
    return new Auth(config, false, userObject);
  });
};

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function () {
  if (this.isMaster || !this.user) {
    return Promise.resolve([]);
  }
  if (this.fetchedRoles) {
    return Promise.resolve(this.userRoles);
  }
  if (this.rolePromise) {
    return rolePromise;
  }
  this.rolePromise = this._loadRoles();
  return this.rolePromise;
};

// Iterates through the role tree and compiles a users roles
Auth.prototype._loadRoles = function () {
  var _this = this;

  var restWhere = {
    'users': {
      __type: 'Pointer',
      className: '_User',
      objectId: this.user.id
    }
  };
  // First get the role ids this user is directly a member of
  var query = new RestQuery(this.config, master(this.config), '_Role', restWhere, {});
  return query.execute().then(function (response) {
    var results = response.results;
    if (!results.length) {
      _this.userRoles = [];
      _this.fetchedRoles = true;
      _this.rolePromise = null;
      return Promise.resolve(_this.userRoles);
    }

    var roleIDs = results.map(function (r) {
      return r.objectId;
    });
    var promises = [Promise.resolve(roleIDs)];
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = roleIDs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var role = _step.value;

        promises.push(_this._getAllRoleNamesForId(role));
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

    return Promise.all(promises).then(function (results) {
      var allIDs = [];
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = results[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var x = _step2.value;

          Array.prototype.push.apply(allIDs, x);
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

      var restWhere = {
        objectId: {
          '$in': allIDs
        }
      };
      var query = new RestQuery(_this.config, master(_this.config), '_Role', restWhere, {});
      return query.execute();
    }).then(function (response) {
      var results = response.results;
      _this.userRoles = results.map(function (r) {
        return 'role:' + r.name;
      });
      _this.fetchedRoles = true;
      _this.rolePromise = null;
      return Promise.resolve(_this.userRoles);
    });
  });
};

// Given a role object id, get any other roles it is part of
// TODO: Make recursive to support role nesting beyond 1 level deep
Auth.prototype._getAllRoleNamesForId = function (roleID) {
  var rolePointer = {
    __type: 'Pointer',
    className: '_Role',
    objectId: roleID
  };
  var restWhere = {
    '$relatedTo': {
      key: 'roles',
      object: rolePointer
    }
  };
  var query = new RestQuery(this.config, master(this.config), '_Role', restWhere, {});
  return query.execute().then(function (response) {
    var results = response.results;
    if (!results.length) {
      return Promise.resolve([]);
    }
    var roleIDs = results.map(function (r) {
      return r.objectId;
    });
    return Promise.resolve(roleIDs);
  });
};

module.exports = {
  Auth: Auth,
  master: master,
  nobody: nobody,
  getAuthForSessionToken: getAuthForSessionToken
};