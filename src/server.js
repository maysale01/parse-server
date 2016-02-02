/* Externals */
import express          from 'express';
import multer           from 'multer';
import request          from 'request';
import bodyParser       from 'body-parser';
import { Parse }        from 'parse/node';

import { batch, cache, addParseCloud } from './utils';
import * as middlewares from './middlewares';
import * as handlers from './handlers';
import { DatabaseAdapter, FilesAdapter, PromiseRouter } from './classes';

// This app serves the Parse API directly.
// It's the equivalent of https://api.parse.com/1 in the hosted Parse API.

addParseCloud();

export function initParseServer(args) {

    if (!args.appId || !args.masterKey) {
        throw 'You must provide an appId and masterKey!';
    }

    if (args.databaseAdapter) {
        DatabaseAdapter.setAdapter(args.databaseAdapter);
    }
    if (args.filesAdapter) {
        FilesAdapter.setAdapter(args.filesAdapter);
    }
    if (args.databaseURI) {
        DatabaseAdapter.setAppDatabaseURI(args.appId, args.databaseURI);
    }
    if (args.cloud) {
        addParseCloud();
        require(args.cloud);
    }

    cache.apps[args.appId] = {
        masterKey: args.masterKey,
        collectionPrefix: args.collectionPrefix || '',
        clientKey: args.clientKey || '',
        javascriptKey: args.javascriptKey || '',
        dotNetKey: args.dotNetKey || '',
        restAPIKey: args.restAPIKey || '',
        fileKey: args.fileKey || 'invalid-file-key',
        facebookAppIds: args.facebookAppIds || []
    };

  // To maintain compatibility. TODO: Remove in v2.1
    if (process.env.FACEBOOK_APP_ID) {
        cache.apps[args.appId]['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
    }

  // Initialize the node client SDK automatically
    Parse.initialize(args.appId, args.javascriptKey || '', args.masterKey);

    const api = express();
    const router = new PromiseRouter();

  // File handling needs to be before default middlewares are applied
    api.use('/', handlers.files.router);

  // TODO: separate this from the regular ParseServer object
    if (process.env.TESTING == 1) {
        console.log('enabling integration testingRoutes');
        api.use('/', handlers.testingRoutes.router);
    }

    api.use(bodyParser.json({ 'type': '*/*' }));
    api.use(middlewares.allowCrossDomain);
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);

    router.merge(handlers['classes']);
    router.merge(handlers['users']);
    router.merge(handlers['sessions']);
    router.merge(handlers['roles']);
    router.merge(handlers['analytics']);
    router.merge(handlers['push']);
    router.merge(handlers['installations']);
    router.merge(handlers['functions']);

    batch.mountOnto(router);

    router.mountOnto(api);

    api.use(middlewares.handleParseErrors);

    return api;

}

export default initParseServer;