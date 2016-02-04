// sessions.js
import { Parse } from 'parse/node';
import { Auth, PromiseRouter } from '../classes';
import { rest } from '../utils';

const router = new PromiseRouter();

export function handleCreate(req) {
    return rest.create(req.config, req.auth, '_Session', req.body);
}

export async function handleUpdate(req) {
    let response = await rest.update(req.config, req.auth, '_Session', req.params.objectId, req.body)
    return {response: response};
}

export async function handleDelete(req) {
    const cache = req.Parse.Server.getCacheProvider().getCache();
    await rest.del(req.config, req.auth, '_Session', req.params.objectId, cache)
    return {response: {}};
}

export async function handleGet(req) {
    let response = rest.find(req.config, req.auth, '_Session', {objectId: req.params.objectId})
    if (!response.results || response.results.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, '[_Session]: Object not found.');
    } else {
        return {response: response.results[0]};
    }
}

export async function handleLogout(req) {
    const cache = req.Parse.Server.getCacheProvider().getCache();
    // TODO: Verify correct behavior for logout without token
    if (!req.info || !req.info.sessionToken) {
        throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Session token required for logout.');
    }
    let response = await rest.find(req.config, Auth.master(req.config), '_Session', { _session_token: req.info.sessionToken});
    if (!response.results || response.results.length == 0) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token not found.');
    }
    await rest.del(req.config, Auth.master(req.config), '_Session', response.results[0].objectId, cache);
    return {
        status: 200,
        response: {}
    };
}

export async function handleFind(req) {
    const options = {};
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

    let response = await rest.find(req.config, req.auth, '_Session', req.body.where, options)
    return {response: response};
}

export async function handleMe(req) {
    // TODO: Verify correct behavior
    if (!req.info || !req.info.sessionToken) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
    }
    let response = await rest.find(req.config, Auth.master(req.config), '_Session', { _session_token: req.info.sessionToken})
    if (!response.results || response.results.length == 0) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token not found.');
    }
    return {
        response: response.results[0]
    };
}

router.route('POST', '/logout', handleLogout);
router.route('POST','/sessions', handleCreate);
router.route('GET','/sessions/me', handleMe);
router.route('GET','/sessions/:objectId', handleGet);
router.route('PUT','/sessions/:objectId', handleUpdate);
router.route('GET','/sessions', handleFind);
router.route('DELETE','/sessions/:objectId', handleDelete);

export default router;