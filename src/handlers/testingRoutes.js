"use strict";
require("babel-polyfill");

import express from 'express';
import * as middlewares from '../middlewares';
import hat from 'hat';
import { ParseApp } from '../classes';

const router = express.Router();
const rack = hat.rack();

// creates a unique app in the cache, with a collection prefix
export function createApp(req, res) {
    const Server = req.Parse.Server;
    const cache = Server.getCacheProvider().getCache();
    const appId = rack();

    let args = {
        'applicationId': appId,
        'collectionPrefix': `${appId}_`,
        'masterKey': 'master'
    };

    Server.createApp(args);

    const keys = {
        'application_id': appId,
        'client_key': 'unused',
        'windows_key': 'unused',
        'javascript_key': 'unused',
        'webhook_key': 'unused',
        'rest_api_key': 'unused',
        'master_key': 'master'
    };
    res.status(200).send(keys);
}

// deletes all collections with the collectionPrefix of the app
export async function clearApp(req, res) {
    if (!req.auth.isMaster) {
        return res.status(401).send({'error': 'unauthorized'});
    }
    
    await req.config.database.deleteEverything();
    res.status(200).send({});
}

// deletes all collections and drops the app from cache
export async function dropApp(req, res) {
    const Server = req.Parse.Server;
    const cache = Server.getCacheProvider().getCache();
    if (!req.auth.isMaster) {
        return res.status(401).send({'error': 'unauthorized'});
    }

    await req.config.database.deleteEverything();
    await cache.deleteApp(req.config.applicationId);
    res.status(200).send({});
}

// Lets just return a success response and see what happens.
export function notImplementedYet(req, res) {
    res.status(200).send({});
}

router.post('/rest_clear_app', middlewares.handleParseHeaders, clearApp);
router.post('/rest_block', middlewares.handleParseHeaders, notImplementedYet);
router.post('/rest_mock_v8_client', middlewares.handleParseHeaders, notImplementedYet);
router.post('/rest_unmock_v8_client', middlewares.handleParseHeaders, notImplementedYet);
router.post('/rest_verify_analytics', middlewares.handleParseHeaders, notImplementedYet);
router.post('/rest_create_app', createApp);
router.post('/rest_drop_app', middlewares.handleParseHeaders, dropApp);
router.post('/rest_configure_app', middlewares.handleParseHeaders, notImplementedYet);

export default router;