"use strict";
require("babel-polyfill");

// These methods handle the 'classes' routes.
// Methods of the form 'handleX' return promises and are intended to
// be used with the PromiseRouter.
import { Parse } from 'parse/node';
import { PromiseRouter } from '../classes';
import { rest} from '../utils';

const router = new PromiseRouter();

// Returns a promise that resolves to a {response} object.
export async function handleFind(req) {
    let body = Object.assign(req.body, req.query);
    let options = {};
    if (body.skip) {
        options.skip = Number(body.skip);
    }
    if (body.limit) {
        options.limit = Number(body.limit);
    }
    if (body.order) {
        options.order = String(body.order);
    }
    if (body.count) {
        options.count = true;
    }
    if (typeof body.keys == 'string') {
        options.keys = body.keys;
    }
    if (body.include) {
        options.include = String(body.include);
    }
    if (body.redirectClassNameForKey) {
        options.redirectClassNameForKey = String(body.redirectClassNameForKey);
    }

    if(typeof body.where === 'string') {
        body.where = JSON.parse(body.where);
    }

    let response = await rest.find(req.config, req.auth, req.params.className, body.where, options);
    return {response: response};
}

// Returns a promise for a {status, response, location} object.
export function handleCreate(req) {
    return rest.create(req.config, req.auth, req.params.className, req.body);
}

// Returns a promise for a {response} object.
export async function handleGet(req) {
    let response = await rest.find(req.config, req.auth, req.params.className, {objectId: req.params.objectId});
    if (!response.results || response.results.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `[Classes:${req.params.className}]: Object not found.`);
    } else {
        return {response: response.results[0]};
    }
}

// Returns a promise for a {response} object.
export async function handleDelete(req) {
    const cache = req.Parse.Server.getCacheProvider().getCache();
    await rest.del(req.config, req.auth, req.params.className, req.params.objectId, cache);
    return {response: {}};
}

// Returns a promise for a {response} object.
export async function handleUpdate(req) {
    let response = await rest.update(req.config, req.auth, req.params.className, req.params.objectId, req.body);
    return {response: response};
}

router.route('GET', '/classes/:className', handleFind);
router.route('POST', '/classes/:className', handleCreate);
router.route('GET', '/classes/:className/:objectId', handleGet);
router.route('DELETE',  '/classes/:className/:objectId', handleDelete);
router.route('PUT', '/classes/:className/:objectId', handleUpdate);

export default router;
