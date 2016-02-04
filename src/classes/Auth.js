"use strict";
require("babel-polyfill");

import deepcopy from 'deepcopy';
import { Parse } from 'parse/node';
import RestQuery from './RestQuery';

// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
class Auth {
    constructor(config, isMaster, userObject) {
        this._config = config;
        this._isMaster = isMaster;
        this._user = userObject;

        // Assuming a users roles won't change during a single request, we'll
        // only load them once.
        this._userRoles = [];
        this._fetchedRoles = false;
        this._rolePromise = null;
    }

    get config () {
        return this._config;
    }

    get isMaster() {
        return this._isMaster;
    }

    get user() {
        return this._user;
    }

    get userRoles() {
        return this._userRoles;
    }

    get fetchedRoles() {
        return this._fetchedRoles;
    }

    get rolePromise() {
        return this._rolePromise;
    }

    set config (value) {
        this._config = value;
    }

    set isMaster (value) {
        this._isMaster = value;
    }

    set user (value) {
        this._user = value;
    }

    set userRoles (value) {
        this._userRoles = value;
    }
    
    set fetchedRoles (value) {
        this._fetchedRoles = value;
    }

    set rolePromise (value) {
        this._rolePromise = value;
    }

    // A helper to get a master-level Auth object
    static master(config) {
        return new Auth(config, true, null);
    }

    // A helper to get a nobody-level Auth object
    static nobody(config) {
        return new Auth(config, false, null);
    }

    // Returns a promise that resolves to an Auth object
    static async getAuthForSessionToken(cache, config, sessionToken) {
        let cachedUser = await cache.getUser(sessionToken);
        if (cachedUser) {
            return Promise.resolve(new Auth(config, false, cachedUser));
        }
        let restOptions = {
            limit: 1,
            include: 'user'
        };
        let restWhere = {
            _session_token: sessionToken
        };
        let response = await (new RestQuery(config, Auth.master(config), '_Session', restWhere, restOptions)).execute();
        let results = response.results;
        if (results.length !== 1 || !results[0]['user']) {
            return Auth.nobody(config);
        }
        let obj = results[0]['user'];
        delete obj.password;
        obj['className'] = '_User';
        let userObject = Parse.Object.fromJSON(obj);
        cache.setUser(sessionToken, userObject);
        return Promise.resolve(new Auth(config, false, userObject));
    };

    // TODO: Can't seem to find where user would get set.
    // Whether this auth could possibly modify the given user id.
    // It still could be forbidden via ACLs even if this returns true.
    couldUpdateUserId(userId) {
        if (this.isMaster) {
            return true;
        }
        if (this.user && this.user.id === userId) {
            return true;
        }
        return false;
    }

    // Returns a promise that resolves to an array of role names
    getUserRoles() {
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
    }

    // Iterates through the role tree and compiles a users roles
    _loadRoles() {
        let restWhere = {
            'users': {
                __type: 'Pointer',
                className: '_User',
                objectId: this.user.id
            }
        };
        // First get the role ids this user is directly a member of
        let query = new RestQuery(this.config, Auth.master(this.config), '_Role',
                                restWhere, {});
        return query.execute().then((response) => {
            let results = response.results;
            if (!results.length) {
                this.userRoles = [];
                this.fetchedRoles = true;
                this.rolePromise = null;
                return Promise.resolve(this.userRoles);
            }

            let roleIDs = results.map(r => r.objectId);
            let promises = [Promise.resolve(roleIDs)];
            for (let role of roleIDs) {
                promises.push(this._getAllRoleNamesForId(role));
            }
            return Promise.all(promises).then((results) => {
                let allIDs = [];
                for (let x of results) {
                    Array.prototype.push.apply(allIDs, x);
                }
                let restWhere = {
                    objectId: {
                        '$in': allIDs
                    }
                };
                let query = new RestQuery(this.config, Auth.master(this.config),
                                    '_Role', restWhere, {});
                return query.execute();
            }).then((response) => {
                let results = response.results;
                this.userRoles = results.map((r) => {
                    return 'role:' + r.name;
                });
                this.fetchedRoles = true;
                this.rolePromise = null;
                return Promise.resolve(this.userRoles);
            });
        });
    }


    // Given a role object id, get any other roles it is part of
    // TODO: Make recursive to support role nesting beyond 1 level deep
    _getAllRoleNamesForId(roleId) {
        let rolePointer = {
            __type: 'Pointer',
            className: '_Role',
            objectId: roleId
        };
        let restWhere = {
            '$relatedTo': {
                key: 'roles',
                object: rolePointer
            }
        };
        let query = new RestQuery(this.config, Auth.master(this.config), '_Role', restWhere, {});
        return query.execute().then((response) => {
            let results = response.results;
            if (!results.length) {
                return Promise.resolve([]);
            }
            let roleIDs = results.map(r => r.objectId);
            return Promise.resolve(roleIDs);
        });
    }
}

export default Auth;