import { Parse } from 'parse/node';
import { PromiseRouter } from '../classes';
import { rest } from '../utils';

const router = new PromiseRouter();

function handleCreate(req) {
    return rest.create(req.config, req.auth, '_Role', req.body);
}

function handleUpdate(req) {
    return rest.update(req.config, req.auth, '_Role', req.params.objectId, req.body)
    .then((response) => {
        return {response: response};
    });
}

function handleDelete(req) {
    const Server = req.Parse.Server;
    const cache = Server.getCacheProvider().cache;
    return rest.del(req.config, req.auth, '_Role', req.params.objectId, cache)
    .then(() => {
        return {response: {}};
    });
}

function handleGet(req) {
    return rest.find(req.config, req.auth, '_Role', {objectId: req.params.objectId})
    .then((response) => {
        if (!response.results || response.results.length == 0) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, '[_Role]: Object not found.');
        } else {
            return {response: response.results[0]};
        }
    });
}

router.route('POST','/roles', handleCreate);
router.route('GET','/roles/:objectId', handleGet);
router.route('PUT','/roles/:objectId', handleUpdate);
router.route('DELETE','/roles/:objectId', handleDelete);

export default router;