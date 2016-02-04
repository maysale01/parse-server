"use strict";
require("babel-polyfill");

// GridStoreAdapter
//
// Stores files in Mongo using GridStore
// Requires the database adapter to be based on mongoclient

import { GridStore } from 'mongodb';
import path from 'path';
import { default as FilesAdapterInterface } from '../interfaces/FilesAdapter';

class GridStoreAdapter extends FilesAdapterInterface {
    // For a given config object, filename, and data, store a file
    // Returns a promise
    create(config, filename, data) {
        if (!config.database.db) {
            throw new Error('Invalid database supplied. The database.db property must be a mongodb connection.')
        }

        return config.database.connect().then(() => {
            let gridStore = new GridStore(config.database.db, filename, 'w');
            return gridStore.open();
        }).then((gridStore) => {
            return gridStore.write(data);
        }).then((gridStore) => {
            return gridStore.close();
        });
    }

    // Search for and return a file if found by filename
    // Resolves a promise that succeeds with the buffer result
    // from GridStore
    get(config, filename) {
        if (!config.database.db) {
            throw new Error('Invalid database supplied. The database.db property must be a mongodb connection.')
        }
        
        return config.database.connect().then(() => {
            return GridStore.exist(config.database.db, filename);
        }).then(() => {
            var gridStore = new GridStore(config.database.db, filename, 'r');
            return gridStore.open();
        }).then((gridStore) => {
            return gridStore.read();
        });
    }

    // Generates and returns the location of a file stored in GridStore for the
    // given request and filename
    location(config, req, filename) {
        let composedPath = `${path.dirname(req.originalUrl)}/${req.config.applicationId}/${encodeURIComponent(filename)}`;
        return `${req.protocol}://${req.get('host')}${composedPath}`;
    }
}

export default GridStoreAdapter;
