// These methods handle the User-related routes.

import mongodb from 'mongodb';
import { Parse } from 'parse/node';
import hat from 'hat';
import { Auth, PromiseRouter, RestWrite } from '../classes';
import { password as passwordCrypto, facebook, rest } from '../utils';

const router  = new PromiseRouter();
const rack = hat.rack();

// Returns a promise for a {status, response, location} object.
export function handleCreate(req) {
    return rest.create(req.config, req.auth, '_User', req.body);
}

// Returns a promise for a {response} object.
export function handleLogIn(req) {
    let user;

    // Use query parameters instead if provided in url
    if (!req.body.username && req.query.username) {
        req.body = req.query;
    }

    // TODO: use the right error codes / descriptions.
    if (!req.body.username) {
        throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'username is required.');
    }
    if (!req.body.password) {
        throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required.');
    }

    // Make sure not to catch any errors from the promise chain, let them propagate.
    return req.database.find('_User', {username: req.body.username})
    .then((results) => {
        if (!results.length) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, '[No results]: Invalid username/password.');
        }
        user = results[0];
        return passwordCrypto.compare(req.body.password, user.password);
    }).then((correct) => {
        if (!correct) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, '[Bad creds]: Invalid username/password.');
        }
        let token = 'r:' + rack();
        user.sessionToken = token;
        delete user.password;

        let expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        let sessionData = {
            sessionToken: token,
            user: {
                __type: 'Pointer',
                className: '_User',
                objectId: user.objectId
            },
            createdWith: {
                'action': 'login',
                'authProvider': 'password'
            },
            restricted: false,
            expiresAt: Parse._encode(expiresAt)
        };

        if (req.info.installationId) {
            sessionData.installationId = req.info.installationId;
        }

        let create = new RestWrite(req.config, Auth.master(req.config), '_Session', null, sessionData);
        return create.execute();
    }).then(() => {
        return {response: user};
    });
}

// Returns a promise that resolves to a {response} object.
// TODO: share code with classes.js
export function handleFind(req) {
    let options = {};
    if (req.body.skip) {
        options.skip = Number(req.body.skip);
    }
    if (req.body.limit) {
        options.limit = Number(req.body.limit);
    }
    if (req.body.order) {
        options.order = String(req.body.order);
    }
    if (req.body.count) {
        options.count = true;
    }
    if (typeof req.body.keys == 'string') {
        options.keys = req.body.keys;
    }
    if (req.body.include) {
        options.include = String(req.body.include);
    }
    if (req.body.redirectClassNameForKey) {
        options.redirectClassNameForKey = String(req.body.redirectClassNameForKey);
    }

    return rest.find(req.config, req.auth, '_User', req.body.where, options)
    .then((response) => {
        return {response: response};
    });
}

// Returns a promise for a {response} object.
export function handleGet(req) {
    return rest.find(req.config, req.auth, '_User', {objectId: req.params.objectId})
    .then((response) => {
        if (!response.results || response.results.length == 0) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, '[_User]: Object not found.');
        } else {
            return {response: response.results[0]};
        }
    });
}

export function handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, '_User]: Object not found.');
    }

    let promise = rest.find(
        req.config, 
        Auth.master(req.config), 
        '_Session', 
        { _session_token: req.info.sessionToken }, 
        { include: 'user' }
    );

    return promise
    .then((response) => {
        if (!response.results || response.results.length == 0 ||
        !response.results[0].user) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, '[_User]: Object not found.');
        } else {
            let user = response.results[0].user;
            return {response: user};
        }
    });
}

export function handleDelete(req) {
    const Server = req.Parse.Server;
    const cache = Server.getCacheProvider().cache;
    return rest.del(req.config, req.auth, req.params.className, req.params.objectId, cache)
    .then(() => {
        return {response: {}};
    });
}

export function handleUpdate(req) {
    return rest.update(req.config, req.auth, '_User', req.params.objectId, req.body)
    .then((response) => {
        return {response: response};
    });
}

export function notImplementedYet(req) {
    throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, 'This path is not implemented yet.');
}

router.route('POST', '/users', handleCreate);
router.route('GET', '/login', handleLogIn);
router.route('GET', '/users/me', handleMe);
router.route('GET', '/users/:objectId', handleGet);
router.route('PUT', '/users/:objectId', handleUpdate);
router.route('GET', '/users', handleFind);
router.route('DELETE', '/users/:objectId', handleDelete);

router.route('POST', '/requestPasswordReset', notImplementedYet);

export default router;
