"use strict";
require("babel-polyfill");

import express from 'express';
import bodyParser from 'body-parser';
import mime from 'mime';
import { Parse } from 'parse/node';
import hat from 'hat';
import { Config } from '../classes';
import * as middlewares from '../middlewares';
import Debug from 'debug';
import util from 'util';

const logError = new Debug('parse-server:errors:handlers/files');
const router = express.Router();
const rack = hat.rack();

export async function processCreate(req, res, next) {
    const Server = req.Parse.Server;

    if (!req.body || !req.body.length) {
        next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
        return;
    }

    if (req.params.filename.length > 128) {
        next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename too long.'));
        return;
    }

    if (!req.params.filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
        next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.'));
        return;
    }

    // If a content-type is included, we'll add an extension so we can
    // return the same content-type.
    let extension = '';
    let hasExtension = req.params.filename.indexOf('.') > 0;
    let contentType = req.get('Content-type');
    if (!hasExtension && contentType && mime.extension(contentType)) {
        extension = '.' + mime.extension(contentType);
    }

    let filename = rack() + '_' + req.params.filename + extension;

    try {
        await Server.getFilesProvider().getAdapter().create(req.config, filename, req.body)
        res.status(201);
        let location = Server.getFilesProvider().getAdapter().location(req.config, req, filename);
        res.set('Location', location);
        res.json({ url: location, name: filename });
    } 
    catch (error) {
        console.error(`[FilesHandler]: ${error}`, error.stack);
        next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Could not store file.'));
    }
};

export async function processGet(req, res) {
    const Server = req.Parse.Server;
    const app = await Server.getCacheProvider().getCache().getApp(req.params.applicationId);
    const config = new Config({ app: app });

    try {
        let data = await Server.getFilesProvider().getAdapter().get(config, req.params.filename)
        res.status(200);
        let contentType = mime.lookup(req.params.filename);
        res.set('Content-type', contentType);
        res.end(data);
    }
    catch(error) {
        res.status(404);
        res.set('Content-type', 'text/plain');
        res.end('File not found.');
    }
};

// Handle file retrieval
router.get('/files/:applicationId/:filename', processGet);

// Handle a post to files without the filename parameter
router.post('/files', function(req, res, next) {
    next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename not provided.'));
});

// TODO: do we need to allow crossdomain and method override?
router.post(
    '/files/:filename',
    bodyParser.raw({type: '*/*', limit: '20mb'}),
    middlewares.handleParseHeaders,
    processCreate
);

export default router;