// push.js
import { Parse } from 'parse/node';
import { PromiseRouter } from '../classes';
import { rest } from '../utils';

const router = new PromiseRouter();

export function notImplementedYet(req) {
    throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, 'This path is not implemented yet.');
}

router.route('POST','/push', notImplementedYet);

export default router;