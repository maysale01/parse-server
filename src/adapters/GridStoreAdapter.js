// GridStoreAdapter
//
// Stores files in Mongo using GridStore
// Requires the database adapter to be based on mongoclient

import { GridStore } from 'mongodb';
import path from 'path';
import { default as FilesAdapterInterface } from '../interfaces/FilesAdapter';

class GridStoreAdapter extends FilesAdapterInterface {
    create(config, filename, data) {
        return config.database.connect().then(() => {
            let gridStore = new GridStore(config.database.db, filename, 'w');
            return gridStore.open();
        }).then((gridStore) => {
            return gridStore.write(data);
        }).then((gridStore) => {
            return gridStore.close();
        });
    }

    get() {
        return config.database.connect().then(() => {
            return GridStore.exist(config.database.db, filename);
        }).then(() => {
            var gridStore = new GridStore(config.database.db, filename, 'r');
            return gridStore.open();
        }).then((gridStore) => {
            return gridStore.read();
        });
    }

    location() {
        let composedPath = `${path.dirname(req.originalUrl)}/${req.config.applicationId}/${encodeURIComponent(filename)}`;
        return `${req.protocol}://${req.get('host')}${composedPath}`;
    }
}

export default GridStoreAdapter;
