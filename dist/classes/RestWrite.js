'use strict';

// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".

var crypto = require('crypto');
var deepcopy = require('deepcopy');
var rack = require('hat').rack();
var Parse = require('parse/node');

var Auth = require('./Auth');
var Config = require('./Config');
var cache = require('../utils/cache');
var passwordCrypto = require('../utils/password');
var facebook = require('../utils/facebook');
var triggers = require('../utils/triggers');

// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.
function RestWrite(config, auth, className, query, data, originalData) {
    this.config = config;
    this.auth = auth;
    this.className = className;
    this.storage = {};

    if (!query && data.objectId) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId ' + 'is an invalid field name.');
    }

    // When the operation is complete, this.response may have several
    // fields.
    // response: the actual data to be returned
    // status: the http status code. if not present, treated like a 200
    // location: the location header. if not present, no location header
    this.response = null;

    // Processing this operation may mutate our data, so we operate on a
    // copy
    this.query = deepcopy(query);
    this.data = deepcopy(data);
    // We never change originalData, so we do not need a deep copy
    this.originalData = originalData;

    // The timestamp we'll use for this whole operation
    this.updatedAt = Parse._encode(new Date()).iso;

    if (this.data) {
        // Add default fields
        this.data.updatedAt = this.updatedAt;
        if (!this.query) {
            this.data.createdAt = this.updatedAt;
            this.data.objectId = newObjectId();
        }
    }
}

// A convenient method to perform all the steps of processing the
// write, in order.
// Returns a promise for a {response, status, location} object.
// status and location are optional.
RestWrite.prototype.execute = function () {
    var _this = this;

    return Promise.resolve().then(function () {
        return _this.validateSchema();
    }).then(function () {
        return _this.handleInstallation();
    }).then(function () {
        return _this.handleSession();
    }).then(function () {
        return _this.runBeforeTrigger();
    }).then(function () {
        return _this.validateAuthData();
    }).then(function () {
        return _this.transformUser();
    }).then(function () {
        return _this.runDatabaseOperation();
    }).then(function () {
        return _this.handleFollowup();
    }).then(function () {
        return _this.runAfterTrigger();
    }).then(function () {
        return _this.response;
    });
};

// Validates this operation against the schema.
RestWrite.prototype.validateSchema = function () {
    return this.config.database.validateObject(this.className, this.data);
};

// Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.
RestWrite.prototype.runBeforeTrigger = function () {
    var _this2 = this;

    // Cloud code gets a bit of extra data for its objects
    var extraData = { className: this.className };
    if (this.query && this.query.objectId) {
        extraData.objectId = this.query.objectId;
    }
    // Build the inflated object, for a create write, originalData is empty
    var inflatedObject = triggers.inflate(extraData, this.originalData);
    inflatedObject._finishFetch(this.data);
    // Build the original object, we only do this for a update write
    var originalObject;
    if (this.query && this.query.objectId) {
        originalObject = triggers.inflate(extraData, this.originalData);
    }

    return Promise.resolve().then(function () {
        return triggers.maybeRunTrigger('beforeSave', _this2.auth, inflatedObject, originalObject);
    }).then(function (response) {
        if (response && response.object) {
            _this2.data = response.object;
            // We should delete the objectId for an update write
            if (_this2.query && _this2.query.objectId) {
                delete _this2.data.objectId;
            }
        }
    });
};

// Transforms auth data for a user object.
// Does nothing if this isn't a user object.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.validateAuthData = function () {
    if (this.className !== '_User') {
        return;
    }

    if (!this.query && !this.data.authData) {
        if (typeof this.data.username !== 'string') {
            throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
        }
        if (typeof this.data.password !== 'string') {
            throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
        }
    }

    if (!this.data.authData) {
        return;
    }

    var facebookData = this.data.authData.facebook;
    var anonData = this.data.authData.anonymous;

    if (anonData === null || anonData && anonData.id) {
        return this.handleAnonymousAuthData();
    } else if (facebookData === null || facebookData && facebookData.id && facebookData.access_token) {
        return this.handleFacebookAuthData();
    } else {
        throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
    }
};

RestWrite.prototype.handleAnonymousAuthData = function () {
    var _this3 = this;

    var anonData = this.data.authData.anonymous;
    if (anonData === null && this.query) {
        // We are unlinking the user from the anonymous provider
        this.data._auth_data_anonymous = null;
        return;
    }

    // Check if this user already exists
    return this.config.database.find(this.className, { 'authData.anonymous.id': anonData.id }, {}).then(function (results) {
        if (results.length > 0) {
            if (!_this3.query) {
                // We're signing up, but this user already exists. Short-circuit
                delete results[0].password;
                _this3.response = {
                    response: results[0],
                    location: _this3.location()
                };
                return;
            }

            // If this is a PUT for the same user, allow the linking
            if (results[0].objectId === _this3.query.objectId) {
                // Delete the rest format key before saving
                delete _this3.data.authData;
                return;
            }

            // We're trying to create a duplicate account.  Forbid it
            throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
        }

        // This anonymous user does not already exist, so transform it
        // to a saveable format
        _this3.data._auth_data_anonymous = anonData;

        // Delete the rest format key before saving
        delete _this3.data.authData;
    });
};

RestWrite.prototype.handleFacebookAuthData = function () {
    var _this4 = this;

    var facebookData = this.data.authData.facebook;
    if (facebookData === null && this.query) {
        // We are unlinking from Facebook.
        this.data._auth_data_facebook = null;
        return;
    }

    return facebook.validateUserId(facebookData.id, facebookData.access_token).then(function () {
        return facebook.validateAppId(_this4.config.facebookAppIds, facebookData.access_token);
    }).then(function () {
        // Check if this user already exists
        // TODO: does this handle re-linking correctly?
        return _this4.config.database.find(_this4.className, { 'authData.facebook.id': facebookData.id }, {});
    }).then(function (results) {
        if (results.length > 0) {
            if (!_this4.query) {
                // We're signing up, but this user already exists. Short-circuit
                delete results[0].password;
                _this4.response = {
                    response: results[0],
                    location: _this4.location()
                };
                return;
            }

            // If this is a PUT for the same user, allow the linking
            if (results[0].objectId === _this4.query.objectId) {
                // Delete the rest format key before saving
                delete _this4.data.authData;
                return;
            }
            // We're trying to create a duplicate FB auth. Forbid it
            throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
        }

        // This FB auth does not already exist, so transform it to a
        // saveable format
        _this4.data._auth_data_facebook = facebookData;

        // Delete the rest format key before saving
        delete _this4.data.authData;
    });
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = function () {
    var _this5 = this;

    if (this.response || this.className !== '_User') {
        return;
    }

    var promise = Promise.resolve();

    if (!this.query) {
        var token = 'r:' + rack();
        this.storage['token'] = token;
        promise = promise.then(function () {
            // TODO: Proper createdWith options, pass installationId
            var sessionData = {
                sessionToken: token,
                user: {
                    __type: 'Pointer',
                    className: '_User',
                    objectId: _this5.objectId()
                },
                createdWith: {
                    'action': 'login',
                    'authProvider': 'password'
                },
                restricted: false
            };
            var create = new RestWrite(_this5.config, Auth.master(_this5.config), '_Session', null, sessionData);
            return create.execute();
        });
    }

    return promise.then(function () {
        // Transform the password
        if (!_this5.data.password) {
            return;
        }
        if (_this5.query) {
            _this5.storage['clearSessions'] = true;
        }
        return passwordCrypto.hash(_this5.data.password).then(function (hashedPassword) {
            _this5.data._hashed_password = hashedPassword;
            delete _this5.data.password;
        });
    }).then(function () {
        // Check for username uniqueness
        if (!_this5.data.username) {
            if (!_this5.query) {
                // TODO: what's correct behavior here
                _this5.data.username = '';
            }
            return;
        }
        return _this5.config.database.find(_this5.className, {
            username: _this5.data.username,
            objectId: { '$ne': _this5.objectId() }
        }, { limit: 1 }).then(function (results) {
            if (results.length > 0) {
                throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username');
            }
            return Promise.resolve();
        });
    }).then(function () {
        if (!_this5.data.email) {
            return;
        }
        // Validate basic email address format
        if (!_this5.data.email.match(/^.+@.+$/)) {
            throw new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.');
        }
        // Check for email uniqueness
        return _this5.config.database.find(_this5.className, {
            email: _this5.data.email,
            objectId: { '$ne': _this5.objectId() }
        }, { limit: 1 }).then(function (results) {
            if (results.length > 0) {
                throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email ' + 'address');
            }
            return Promise.resolve();
        });
    });
};

// Handles any followup logic
RestWrite.prototype.handleFollowup = function () {
    if (this.storage && this.storage['clearSessions']) {
        var sessionQuery = {
            user: {
                __type: 'Pointer',
                className: '_User',
                objectId: this.objectId()
            }
        };
        delete this.storage['clearSessions'];
        return this.config.database.destroy('_Session', sessionQuery).then(this.handleFollowup.bind(this));
    }
};

// Handles the _Role class specialness.
// Does nothing if this isn't a role object.
RestWrite.prototype.handleRole = function () {
    if (this.response || this.className !== '_Role') {
        return;
    }

    if (!this.auth.user && !this.auth.isMaster) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
    }

    if (!this.data.name) {
        throw new Parse.Error(Parse.Error.INVALID_ROLE_NAME, 'Invalid role name.');
    }
};

// Handles the _Session class specialness.
// Does nothing if this isn't an installation object.
RestWrite.prototype.handleSession = function () {
    var _this6 = this;

    if (this.response || this.className !== '_Session') {
        return;
    }

    if (!this.auth.user && !this.auth.isMaster) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
    }

    // TODO: Verify proper error to throw
    if (this.data.ACL) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ' + 'ACL on a Session.');
    }

    if (!this.query && !this.auth.isMaster) {
        var token = 'r:' + rack();
        var sessionData = {
            sessionToken: token,
            user: {
                __type: 'Pointer',
                className: '_User',
                objectId: this.auth.user.id
            },
            createdWith: {
                'action': 'create'
            },
            restricted: true,
            expiresAt: 0
        };
        for (var key in this.data) {
            if (key == 'objectId') {
                continue;
            }
            sessionData[key] = this.data[key];
        }
        var create = new RestWrite(this.config, Auth.master(this.config), '_Session', null, sessionData);
        return create.execute().then(function (results) {
            if (!results.response) {
                throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
            }
            sessionData['objectId'] = results.response['objectId'];
            _this6.response = {
                status: 201,
                location: results.location,
                response: sessionData
            };
        });
    }
};

// Handles the _Installation class specialness.
// Does nothing if this isn't an installation object.
// If an installation is found, this can mutate this.query and turn a create
// into an update.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.handleInstallation = function () {
    var _this7 = this;

    if (this.response || this.className !== '_Installation') {
        return;
    }

    if (!this.query && !this.data.deviceToken && !this.data.installationId) {
        throw new Parse.Error(135, 'at least one ID field (deviceToken, installationId) ' + 'must be specified in this operation');
    }

    if (!this.query && !this.data.deviceType) {
        throw new Parse.Error(135, 'deviceType must be specified in this operation');
    }

    // If the device token is 64 characters long, we assume it is for iOS
    // and lowercase it.
    if (this.data.deviceToken && this.data.deviceToken.length == 64) {
        this.data.deviceToken = this.data.deviceToken.toLowerCase();
    }

    // TODO: We may need installationId from headers, plumb through Auth?
    //       per installation_handler.go

    // We lowercase the installationId if present
    if (this.data.installationId) {
        this.data.installationId = this.data.installationId.toLowerCase();
    }

    if (this.data.deviceToken && this.data.deviceType == 'android') {
        throw new Parse.Error(114, 'deviceToken may not be set for deviceType android');
    }

    var promise = Promise.resolve();

    if (this.query && this.query.objectId) {
        promise = promise.then(function () {
            return _this7.config.database.find('_Installation', {
                objectId: _this7.query.objectId
            }, {}).then(function (results) {
                if (!results.length) {
                    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
                }
                var existing = results[0];
                if (_this7.data.installationId && existing.installationId && _this7.data.installationId !== existing.installationId) {
                    throw new Parse.Error(136, 'installationId may not be changed in this ' + 'operation');
                }
                if (_this7.data.deviceToken && existing.deviceToken && _this7.data.deviceToken !== existing.deviceToken && !_this7.data.installationId && !existing.installationId) {
                    throw new Parse.Error(136, 'deviceToken may not be changed in this ' + 'operation');
                }
                if (_this7.data.deviceType && _this7.data.deviceType && _this7.data.deviceType !== existing.deviceType) {
                    throw new Parse.Error(136, 'deviceType may not be changed in this ' + 'operation');
                }
                return Promise.resolve();
            });
        });
    }

    // Check if we already have installations for the installationId/deviceToken
    var installationMatch;
    var deviceTokenMatches = [];
    promise = promise.then(function () {
        if (_this7.data.installationId) {
            return _this7.config.database.find('_Installation', {
                'installationId': _this7.data.installationId
            });
        }
        return Promise.resolve([]);
    }).then(function (results) {
        if (results && results.length) {
            // We only take the first match by installationId
            installationMatch = results[0];
        }
        if (_this7.data.deviceToken) {
            return _this7.config.database.find('_Installation', { 'deviceToken': _this7.data.deviceToken });
        }
        return Promise.resolve([]);
    }).then(function (results) {
        if (results) {
            deviceTokenMatches = results;
        }
        if (!installationMatch) {
            if (!deviceTokenMatches.length) {
                return;
            } else if (deviceTokenMatches.length == 1 && (!deviceTokenMatches[0]['installationId'] || !_this7.data.installationId)) {
                // Single match on device token but none on installationId, and either
                // the passed object or the match is missing an installationId, so we
                // can just return the match.
                return deviceTokenMatches[0]['objectId'];
            } else if (!_this7.data.installationId) {
                throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
            } else {
                // Multiple device token matches and we specified an installation ID,
                // or a single match where both the passed and matching objects have
                // an installation ID. Try cleaning out old installations that match
                // the deviceToken, and return nil to signal that a new object should
                // be created.
                var delQuery = {
                    'deviceToken': _this7.data.deviceToken,
                    'installationId': {
                        '$ne': _this7.data.installationId
                    }
                };
                if (_this7.data.appIdentifier) {
                    delQuery['appIdentifier'] = _this7.data.appIdentifier;
                }
                _this7.config.database.destroy('_Installation', delQuery);
                return;
            }
        } else {
            if (deviceTokenMatches.length == 1 && !deviceTokenMatches[0]['installationId']) {
                // Exactly one device token match and it doesn't have an installation
                // ID. This is the one case where we want to merge with the existing
                // object.
                var delQuery = { objectId: installationMatch.objectId };
                return _this7.config.database.destroy('_Installation', delQuery).then(function () {
                    return deviceTokenMatches[0]['objectId'];
                });
            } else {
                if (_this7.data.deviceToken && installationMatch.deviceToken != _this7.data.deviceToken) {
                    // We're setting the device token on an existing installation, so
                    // we should try cleaning out old installations that match this
                    // device token.
                    var delQuery = {
                        'deviceToken': _this7.data.deviceToken,
                        'installationId': {
                            '$ne': _this7.data.installationId
                        }
                    };
                    if (_this7.data.appIdentifier) {
                        delQuery['appIdentifier'] = _this7.data.appIdentifier;
                    }
                    _this7.config.database.destroy('_Installation', delQuery);
                }
                // In non-merge scenarios, just return the installation match id
                return installationMatch.objectId;
            }
        }
    }).then(function (objId) {
        if (objId) {
            _this7.query = { objectId: objId };
            delete _this7.data.objectId;
            delete _this7.data.createdAt;
        }
        // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
    });
    return promise;
};

RestWrite.prototype.runDatabaseOperation = function () {
    var _this8 = this;

    if (this.response) {
        return;
    }

    if (this.className === '_User' && this.query && !this.auth.couldUpdateUserId(this.query.objectId)) {
        throw new Parse.Error(Parse.Error.SESSION_MISSING, 'cannot modify user ' + this.objectId);
    }

    // TODO: Add better detection for ACL, ensuring a user can't be locked from
    //       their own user record.
    if (this.data.ACL && this.data.ACL['*unresolved']) {
        throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
    }

    var options = {};
    if (!this.auth.isMaster) {
        options.acl = ['*'];
        if (this.auth.user) {
            options.acl.push(this.auth.user.id);
        }
    }

    if (this.query) {
        // Run an update
        return this.config.database.update(this.className, this.query, this.data, options).then(function (resp) {
            _this8.response = resp;
            _this8.response.updatedAt = _this8.updatedAt;
        });
    } else {
        // Run a create
        return this.config.database.create(this.className, this.data, options).then(function () {
            var resp = {
                objectId: _this8.data.objectId,
                createdAt: _this8.data.createdAt
            };
            if (_this8.storage['token']) {
                resp.sessionToken = _this8.storage['token'];
            }
            _this8.response = {
                status: 201,
                response: resp,
                location: _this8.location()
            };
        });
    }
};

// Returns nothing - doesn't wait for the trigger.
RestWrite.prototype.runAfterTrigger = function () {
    var extraData = { className: this.className };
    if (this.query && this.query.objectId) {
        extraData.objectId = this.query.objectId;
    }

    // Build the inflated object, different from beforeSave, originalData is not empty
    // since developers can change data in the beforeSave.
    var inflatedObject = triggers.inflate(extraData, this.originalData);
    inflatedObject._finishFetch(this.data);
    // Build the original object, we only do this for a update write.
    var originalObject;
    if (this.query && this.query.objectId) {
        originalObject = triggers.inflate(extraData, this.originalData);
    }

    triggers.maybeRunTrigger('afterSave', this.auth, inflatedObject, originalObject);
};

// A helper to figure out what location this operation happens at.
RestWrite.prototype.location = function () {
    var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
    return this.config.mount + middle + this.data.objectId;
};

// A helper to get the object id for this operation.
// Because it could be either on the query or on the data
RestWrite.prototype.objectId = function () {
    return this.data.objectId || this.query.objectId;
};

// Returns a unique string that's usable as an object id.
function newObjectId() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz' + '0123456789';
    var objectId = '';
    var bytes = crypto.randomBytes(10);
    for (var i = 0; i < bytes.length; ++i) {
        // Note: there is a slight modulo bias, because chars length
        // of 62 doesn't divide the number of all bytes (256) evenly.
        // It is acceptable for our purposes.
        objectId += chars[bytes.readUInt8(i) % chars.length];
    }
    return objectId;
}

module.exports = RestWrite;