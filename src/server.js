"use strict";
require("babel-polyfill");

/* Externals */
import express          from 'express';
import multer           from 'multer';
import request          from 'request';
import bodyParser       from 'body-parser';
import { Parse }        from 'parse/node';
import morgan           from 'morgan';
import { addParseCloud } from './utils';
import * as middlewares from './middlewares';
import * as handlers from './handlers';
import { 
    PromiseRouter, 
    ParseApp, 
    ParseServer
} from './classes';

// This app serves the Parse API directly.
// It's the equivalent of https://api.parse.com/1 in the hosted Parse API.

addParseCloud();

export function initParseServer(args = {}) {
    const app = express();
    const router = new PromiseRouter();
    const server = new ParseServer(args);

    // Allow handlers to access the server and apps
    app.use(function(req, res, next) {
        req.Parse = {
            Server: server
        };

        next();
    });

    // Expose it for manipulation
    app.set('Parse', {
        Server: server
    });

//    app.use(morgan('dev'));

    // File handling needs to be before default middlewares are applied
    app.use('/', handlers.files);

    // TODO: separate this from the regular ParseServer object
    if (process.env.TESTING == 1) {
        console.log('enabling integration testingRoutes');
        app.use('/', handlers.testingRoutes);
    }

    app.use(bodyParser.json({ 'type': '*/*' }));
    app.use(middlewares.allowCrossDomain);
    app.use(middlewares.allowMethodOverride);
    app.use(middlewares.handleParseHeaders);

    // app.use('/', function(req, res, next) {
    //     console.log(req.body);
    //     next();
    // });

    router.merge(handlers['classes']);
    router.merge(handlers['users']);
    router.merge(handlers['sessions']);
    router.merge(handlers['roles']);
    router.merge(handlers['analytics']);
    router.merge(handlers['push']);
    router.merge(handlers['installations']);
    router.merge(handlers['functions']);

    // Bind the router as the lexical scope so we can call the match method
    router.route('POST', '/batch', handlers['batch'].bind(router));

    router.mountOnto(app);

    app.use(middlewares.handleParseErrors);

    return app;

}

export default initParseServer;