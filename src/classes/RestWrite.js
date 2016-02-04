"use strict";
require("babel-polyfill");

// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".
import { Parse } from 'parse/node';
import crypto from 'crypto';
import deepcopy from 'deepcopy';
import hat from 'hat';

import { password as passwordCrypto, facebook, triggers } from '../utils';

import { default as Auth } from './Auth';
import { default as Config } from './Config';

// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.

const rack = hat.rack();

class RestWrite {
    constructor(config, auth, className, query, data, originalData) {
        this._config = config;
        this._auth = auth;
        this._className = className;
        this._storage = {};

        if (!query && data.objectId) {
            throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `objectId is an invalid field name.`);
        }


        // When the operation is complete, this.response may have several
        // fields.
        // response: the actual data to be returned
        // status: the http status code. if not present, treated like a 200
        // location: the location header. if not present, no location header
        this._response = null;

        // Processing this operation may mutate our data, so we operate on a
        // copy
        this._query = deepcopy(query);
        this._data = deepcopy(data);

        // We never change originalData, so we do not need a deep copy
        this._originalData = originalData;

        // The timestamp we'll use for this whole operation
        this._updatedAt = Parse._encode(new Date()).iso;

        if (this._data) {
            // Add default fields
            this._data.updatedAt = this._updatedAt;
            if (!this._query) {
                this._data.createdAt = this._updatedAt;
                this._data.objectId = newObjectId();
            }
        }
    }

    get config () {
        return this._config;
    }

    get auth () {
        return this._auth;
    }

    get className () {
        return this._className;
    }

    get storage () {
        return this._storage;
    }

    get response () {
        return this._response;
    }

    get query () {
        return this._query;
    }

    get data () {
        return this._data;
    }

    get originalData () {
        return this._originalData;
    }

    get updatedAt () {
        return this._updatedAt;
    }

    set config (value) {
        this._config = value;
    }

    set auth (value) {
        this._auth = value;
    }

    set className (value) {
        this._className = value;
    }

    set storage (value) {
        this._storage = value;
    }

    set response (value) {
        this._response = value;
    }

    set query (value) {
        this._query = value;
    }

    set data (value) {
        this._data = value;
    }

    set originalData (value) {
        this._originalData = value;
    }

    set updatedAt (value) {
        this._updatedAt = value;
    }

    // A convenient method to perform all the steps of processing the
    // write, in order.
    // Returns a promise for a {response, status, location} object.
    // status and location are optional.
    execute() {
        return Promise.resolve().then(() => {
            return this.validateSchema();
        }).then(() => {
            return this.handleInstallation();
        }).then(() => {
            return this.handleSession();
        }).then(() => {
            return this.runBeforeTrigger();
        }).then(() => {
            return this.validateAuthData();
        }).then(() => {
            return this.transformUser();
        }).then(() => {
            return this.runDatabaseOperation();
        }).then(() => {
            return this.handleFollowup();
        }).then(() => {
            return this.runAfterTrigger();
        }).then(() => {
            return this.response;
        });
    }

    // Validates this operation against the schema.
    validateSchema() {
        if (!this.config.database) {
            throw new Error('Database must be defined on the config!');
        }
        return this.config.database.validateObject(this.className, this.data);
    }

    // Runs any beforeSave triggers against this operation.
    // Any change leads to our data being mutated.
    runBeforeTrigger() {
        // Cloud code gets a bit of extra data for its objects
        let extraData = {className: this.className};
        if (this.query && this.query.objectId) {
            extraData.objectId = this.query.objectId;
        }
        
        // Build the inflated object, for a create write, originalData is empty
        let inflatedObject = triggers.inflate(extraData, this.originalData);
        inflatedObject._finishFetch(this.data);

        // Build the original object, we only do this for a update write
        let originalObject;
        if (this.query && this.query.objectId) {
            originalObject = triggers.inflate(extraData, this.originalData);
        }

        return Promise.resolve()
        .then(() => {
            return triggers.maybeRunTrigger('beforeSave', this.auth, inflatedObject, originalObject);
        }).then((response) => {
            if (response && response.object) {
                this.data = response.object;
                //  We should delete the objectId for an update write
                if (this.query && this.query.objectId) {
                    delete this.data.objectId;
                }
            }
        });
    }

    // Transforms auth data for a user object.
    // Does nothing if this isn't a user object.
    // Returns a promise for when we're done if it can't finish this tick.
    validateAuthData() {
        if (this.className !== '_User') {
            return;
        }

        if (!this.query && !this.data.authData) {
            if (typeof this.data.username !== 'string') {
                throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'Bad or missing username');
            }
            if (typeof this.data.password !== 'string') {
                throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'Password is required');
            }
        }

        if (!this.data.authData) {
            return;
        }

        let facebookData = this.data.authData.facebook;
        let anonData = this.data.authData.anonymous;

        if (anonData === null ||
        (anonData && anonData.id)) {
            return this.handleAnonymousAuthData();
        } else if (facebookData === null ||
        (facebookData && facebookData.id && facebookData.access_token)) {
            return this.handleFacebookAuthData();
        } else {
            throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
        }
    }

    handleAnonymousAuthData() {

        let anonData = this.data.authData.anonymous;
        if (anonData === null && this.query) {
            // We are unlinking the user from the anonymous provider
            this.data._auth_data_anonymous = null;
            return;
        }

        // Check if this user already exists
        return this.config.database.find(this.className, {'authData.anonymous.id': anonData.id}, {})
        .then((results) => {
            if (results.length > 0) {
                if (!this.query) {
                    //  We're signing up, but this user already exists. Short-circuit
                    delete results[0].password;
                    this.response = {
                        response: results[0],
                        ocation: this.location()
                    };
                    return;
                }

                //  If this is a PUT for the same user, allow the linking
                if (results[0].objectId === this.query.objectId) {
                    //  Delete the rest format key before saving
                    delete this.data.authData;
                    return;
                }

                //  We're trying to create a duplicate account.  Forbid it
                throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'This auth is already used');
            }

            // This anonymous user does not already exist, so transform it
            // to a saveable format
            this.data._auth_data_anonymous = anonData;

            // Delete the rest format key before saving
            delete this.data.authData;
        });
    }

    handleFacebookAuthData() {

        let facebookData = this.data.authData.facebook;
        if (facebookData === null && this.query) {
            // We are unlinking from Facebook.
            this.data._auth_data_facebook = null;
            return;
        }

        return facebook.validateUserId(facebookData.id,    facebookData.access_token)
        .then(() => {
            return facebook.validateAppId(this.config.facebookAppIds,       facebookData.access_token);
        }).then(() => {
            // Check if this user already exists
            // TODO: does this handle re-linking correctly?
            return this.config.database.find(this.className, {'authData.facebook.id': facebookData.id}, {});
        }).then((results) => {
            if (results.length > 0) {
                if (!this.query) {
                    // We're signing up, but this user already exists. Short-circuit
                    delete results[0].password;
                    this.response = {
                        response: results[0],
                        location: this.location()
                    };
                    return;
                }

                // If this is a PUT for the same user, allow the linking
                if (results[0].objectId === this.query.objectId) {
                // Delete the rest format key before saving
                    delete this.data.authData;
                    return;
                }
                // We're trying to create a duplicate FB auth. Forbid it
                throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
            }

            // This FB auth does not already exist, so transform it to a
            // saveable format
            this.data._auth_data_facebook = facebookData;

            // Delete the rest format key before saving
            delete this.data.authData;
        });
    }

    // The non-third-party parts of User transformation
    transformUser() {

        if (this.response || this.className !== '_User') {
            return;
        }

        let promise = Promise.resolve();
        if (!this.query) {
            let token = 'r:' + rack();
            this.storage['token'] = token;
            promise = promise.then(() => {
                // TODO: Proper createdWith options, pass installationId
                let sessionData = {
                    sessionToken: token,
                    user: {
                        __type: 'Pointer',
                        className: '_User',
                        objectId: this.objectId()
                    },
                    createdWith: {
                        'action': 'login',
                        'authProvider': 'password'
                    },
                    restricted: false
                };
                let create = new RestWrite(this.config, Auth.master(this.config),    '_Session', null, sessionData);
                return create.execute();
            });
        }

        return promise.then(() => {
            // Transform the password
            if (!this.data.password) {
                return;
            }
            if (this.query) {
                this.storage['clearSessions'] = true;
            }
            return passwordCrypto.hash(this.data.password).then((hashedPassword) => {
                this.data._hashed_password = hashedPassword;
                delete this.data.password;
            });

        }).then(() => {
            // Check for username uniqueness
            if (!this.data.username) {
                if (!this.query) {
                    // TODO: what's correct behavior here
                    this.data.username = '';
                }
                return;
            }
            return this.config.database.find(
          this.className, {
              username: this.data.username,
              objectId: {'$ne': this.objectId()}
          }, {limit: 1}).then((results) => {
              if (results.length > 0) {
                  throw new Parse.Error(Parse.Error.USERNAME_TAKEN,   'Account already exists for this username');
              }
              return Promise.resolve();
          });
        }).then(() => {
            if (!this.data.email) {
                return;
            }
            // Validate basic email address format
            if (!this.data.email.match(/^.+@.+$/)) {
                throw new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS,
                                'Email address format is invalid.');
            }
            // Check for email uniqueness
            return this.config.database.find(this.className, {
                    email: this.data.email,
                    objectId: {'$ne': this.objectId()}
                }, 
                {limit: 1}
            ).then((results) => {
                if (results.length > 0) {
                    throw new Parse.Error(Parse.Error.EMAIL_TAKEN,   'Account already exists for this email ' +   'address');
                }
                return Promise.resolve();
            });
        });
    }

    // Handles any followup logic
    handleFollowup() {
        if (this.storage && this.storage['clearSessions']) {
            let sessionQuery = {
                user: {
                    __type: 'Pointer',
                    className: '_User',
                    objectId: this.objectId()
                }
            };
            delete this.storage['clearSessions'];
            return this.config.database.destroy('_Session', sessionQuery)
            .then(this.handleFollowup.bind(this));
        }
    }

    // Handles the _Role class specialness.
    // Does nothing if this isn't a role object.
    handleRole() {
        if (this.response || this.className !== '_Role') {
            return;
        }

        if (!this.auth.user && !this.auth.isMaster) {
            throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
        }

        if (!this.data.name) {
            throw new Parse.Error(Parse.Error.INVALID_ROLE_NAME, 'Invalid role name.');
        }
    }

    // Handles the _Session class specialness.
    // Does nothing if this isn't an installation object.
    handleSession() {

        if (this.response || this.className !== '_Session') {
            return;
        }

        if (!this.auth.user && !this.auth.isMaster) {
            throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
        }

        // TODO: Verify proper error to throw
        if (this.data.ACL) {
            throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ACL on a Session.');
        }
        
        if (!this.query && !this.auth.isMaster) {
            let token = 'r:' + rack();
            let sessionData = {
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
            for (let key in this.data) {
                if (key == 'objectId') {
                    continue;
                }
                sessionData[key] = this.data[key];
            }
            let create = new RestWrite(this.config, Auth.master(this.config),  '_Session', null, sessionData);
            return create.execute().then((results) => {
                if (!results.response) {
                    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
                }
                sessionData['objectId'] = results.response['objectId'];
                this.response = {
                    status: 201,
                    location: results.location,
                    response: sessionData
                };
            });
        }
    }

    // Handles the _Installation class specialness.
    // Does nothing if this isn't an installation object.
    // If an installation is found, this can mutate this.query and turn a create
    // into an update.
    // Returns a promise for when we're done if it can't finish this tick.
    handleInstallation() {

        if (this.response || this.className !== '_Installation') {
            return;
        }

        if (!this.query && !this.data.deviceToken && !this.data.installationId) {
            throw new Parse.Error(135, 'at least one ID field (deviceToken, installationId) must be specified in this operation');
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
        //      per installation_handler.go

        // We lowercase the installationId if present
        if (this.data.installationId) {
            this.data.installationId = this.data.installationId.toLowerCase();
        }

        if (this.data.deviceToken && this.data.deviceType == 'android') {
            throw new Parse.Error(114, 'deviceToken may not be set for deviceType android');
        }

        let promise = Promise.resolve();

        if (this.query && this.query.objectId) {
            promise = promise.then(() => {
                return this.config.database.find('_Installation', {
                    objectId: this.query.objectId
                }, {})
                .then((results) => {
                    if (!results.length) {
                        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
                    }
                    let existing = results[0];
                    if (this.data.installationId && existing.installationId &&
                    this.data.installationId !== existing.installationId) {
                        throw new Parse.Error(136, 'installationId may not be changed in this operation');
                    }
                    if (this.data.deviceToken && existing.deviceToken &&
                    this.data.deviceToken !== existing.deviceToken &&
                    !this.data.installationId && !existing.installationId) {
                        throw new Parse.Error(136, 'deviceToken may not be changed in this operation');
                    }
                    if (this.data.deviceType && this.data.deviceType &&
                    this.data.deviceType !== existing.deviceType) {
                        throw new Parse.Error(136, 'deviceType may not be changed in this operation');
                    }
                    return Promise.resolve();
                });
            });
        }

        // Check if we already have installations for the installationId/deviceToken
        let installationMatch;
        let deviceTokenMatches = [];
        promise = promise.then(() => {
            if (this.data.installationId) {
                return this.config.database.find('_Installation', {
                    'installationId': this.data.installationId
                });
            }
            return Promise.resolve([]);
        }).then((results) => {
            if (results && results.length) {
                // We only take the first match by installationId
                installationMatch = results[0];
            }

            if (this.data.deviceToken) {
                return this.config.database.find(
                    '_Installation',
                    {'deviceToken': this.data.deviceToken}
                );
            }

            return Promise.resolve([]);
        }).then((results) => {
            if (results) {
                deviceTokenMatches = results;
            }

            if (!installationMatch) {
                if (!deviceTokenMatches.length) {
                    return;
                } else if (deviceTokenMatches.length == 1 &&
                (!deviceTokenMatches[0]['installationId'] || !this.data.installationId)
                ) {
                    // Single match on device token but none on installationId, and either
                    // the passed object or the match is missing an installationId, so we
                    // can just return the match.
                    return deviceTokenMatches[0]['objectId'];
                } else if (!this.data.installationId) {
                    throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
                } else {
                    // Multiple device token matches and we specified an installation ID,
                    // or a single match where both the passed and matching objects have
                    // an installation ID. Try cleaning out old installations that match
                    // the deviceToken, and return nil to signal that a new object should
                    // be created.
                    let delQuery = {
                        'deviceToken': this.data.deviceToken,
                        'installationId': {
                            '$ne': this.data.installationId
                        }
                    };
                    if (this.data.appIdentifier) {
                        delQuery['appIdentifier'] = this.data.appIdentifier;
                    }
                    this.config.database.destroy('_Installation', delQuery);
                    return;
                }
            } else {
                if (deviceTokenMatches.length == 1 &&
                !deviceTokenMatches[0]['installationId']) {
                    // Exactly one device token match and it doesn't have an installation
                    // ID. This is the one case where we want to merge with the existing
                    // object.
                    let delQuery = {objectId: installationMatch.objectId};
                    return this.config.database.destroy('_Installation', delQuery)
                    .then(() => {
                        return deviceTokenMatches[0]['objectId'];
                    });
                } else {
                    if (this.data.deviceToken &&
                    installationMatch.deviceToken != this.data.deviceToken) {
                        // We're setting the device token on an existing installation, so
                        // we should try cleaning out old installations that match this
                        // device token.
                        let delQuery = {
                            'deviceToken': this.data.deviceToken,
                            'installationId': {
                                '$ne': this.data.installationId
                            }
                        };
                        if (this.data.appIdentifier) {
                            delQuery['appIdentifier'] = this.data.appIdentifier;
                        }
                        this.config.database.destroy('_Installation', delQuery);
                    }
                    // In non-merge scenarios, just return the installation match id
                    return installationMatch.objectId;
                }
            }
        }).then((objId) => {
            if (objId) {
                this.query = {objectId: objId};
                delete this.data.objectId;
                delete this.data.createdAt;
            }
            // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
        });
        return promise;
    }

    runDatabaseOperation() {

        if (this.response) {
            return;
        }

        if (this.className === '_User' &&
        this.query &&
        !this.auth.couldUpdateUserId(this.query.objectId)) {
            throw new Parse.Error(Parse.Error.SESSION_MISSING, 'cannot modify user ' + this.query.objectId);
        }

        // TODO: Add better detection for ACL, ensuring a user can't be locked from
        //      their own user record.
        if (this.data.ACL && this.data.ACL['*unresolved']) {
            throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
        }

        let options = {};
        if (!this.auth.isMaster) {
            options.acl = ['*'];
            if (this.auth.user) {
                options.acl.push(this.auth.user.id);
            }
        }

        if (this.query) {
            // Run an update
            return this.config.database.update(this.className, this.query, this.data, options)
            .then((resp) => {
                this.response = resp;
                this.response.updatedAt = this.updatedAt;
            });
        } else {
            // Run a create
            return this.config.database.create(this.className, this.data, options)
            .then(() => {
                let resp = {
                    objectId: this.data.objectId,
                    createdAt: this.data.createdAt
                };
                if (this.storage['token']) {
                    resp.sessionToken = this.storage['token'];
                }
                this.response = {
                    status: 201,
                    response: resp,
                    location: this.location()
                };
            });
        }
    }

    // Returns nothing - doesn't wait for the trigger.
    runAfterTrigger() {
        let extraData = {className: this.className};
        if (this.query && this.query.objectId) {
            extraData.objectId = this.query.objectId;
        }

        // Build the inflated object, different from beforeSave, originalData is not empty
        // since developers can change data in the beforeSave.
        let inflatedObject = triggers.inflate(extraData, this.originalData);
        inflatedObject._finishFetch(this.data);
        // Build the original object, we only do this for a update write.
        let originalObject;
        if (this.query && this.query.objectId) {
            originalObject = triggers.inflate(extraData, this.originalData);
        }

        triggers.maybeRunTrigger('afterSave', this.auth, inflatedObject, originalObject);
    }

    // A helper to figure out what location this operation happens at.
    location() {
        let middle = (this.className === '_User' ? '/users/' :
                    '/classes/' + this.className + '/');
        return this.config.mount + middle + this.data.objectId;
    }

    // A helper to get the object id for this operation.
    // Because it could be either on the query or on the data
    objectId() {
        return this.data.objectId || this.query.objectId;
    }
}

// Returns a unique string that's usable as an object id.
export function newObjectId() {
    let chars = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
               'abcdefghijklmnopqrstuvwxyz' +
               '0123456789');
    let objectId = '';
    let bytes = crypto.randomBytes(10);
    for (let i = 0; i < bytes.length; ++i) {
        // Note: there is a slight modulo bias, because chars length
        // of 62 doesn't divide the number of all bytes (256) evenly.
        // It is acceptable for our purposes.
        objectId += chars[bytes.readUInt8(i) % chars.length];
    }
    return objectId;
}

export default RestWrite;
