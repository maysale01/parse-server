// analytics.js
import { Parse } from 'parse/node';
import { PromiseRouter } from '../classes';
import { rest} from '../utils';

const router = new PromiseRouter();

// Returns a promise that resolves to an empty object response
function ignoreAndSucceed(req) {
    return Promise.resolve({
        response: {}
    });
}

router.route('POST','/events/AppOpened', ignoreAndSucceed);
router.route('POST','/events/:eventName', ignoreAndSucceed);

export default router;