import { Parse } from 'parse/node';
import { PromiseRouter } from '../classes';
import { rest } from '../utils';

const router = new PromiseRouter();

export function handleCreate(req) {
    return rest.create(req.config, req.auth, '_Role', req.body);
}

export async function handleUpdate(req) {
    let response = await rest.update(req.config, req.auth, '_Role', req.params.objectId, req.body)
    return {response: response};
}

export async function handleDelete(req) {
    const cache = req.Parse.Server.getCacheProvider().getCache();
    await rest.del(req.config, req.auth, '_Role', req.params.objectId, cache)
    return {response: {}};
}

export async function handleGet(req) {
    let response = await rest.find(req.config, req.auth, '_Role', {objectId: req.params.objectId})
    if (!response.results || response.results.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, '[_Role]: Object not found.');
    } else {
        return {response: response.results[0]};
    }
}

router.route('POST','/roles', handleCreate);
router.route('GET','/roles/:objectId', handleGet);
router.route('PUT','/roles/:objectId', handleUpdate);
router.route('DELETE','/roles/:objectId', handleDelete);

export default router;